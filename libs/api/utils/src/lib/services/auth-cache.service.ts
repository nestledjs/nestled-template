import { Injectable, Logger, Optional } from '@nestjs/common'
import Redis from 'ioredis'
import { OrganizationContext } from '../types/nest-context-type'

/**
 * Every auth-cache read sits on the request path (SSR renders included), and every caller treats a
 * failed read as a miss and goes to the database. So a slow or unreachable Redis must fail fast
 * rather than hold the request: one retry, a 2s connect timeout and a 3s per-command timeout
 * (which also bounds a command waiting in the offline queue). These change only how quickly the
 * cache falls through to the database, never what is authorized.
 */
export const AUTH_CACHE_REDIS_TIMEOUTS = {
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  commandTimeout: 3000,
} as const

/**
 * One cache read. `miss`: nothing is cached (or the cache is not configured), so read the
 * database. `unavailable`: Redis failed (down, timed out, a value that would not parse), which says
 * nothing about the session or the membership.
 *
 * The `get*` methods fold both into `null`. That is only right for a caller that reads the database
 * on `null`. A caller that would read `null` as "no session", "not a member" or "no organization"
 * must use the matching `lookup*` method and treat `unavailable` as an outage (fall back to the
 * database, or answer 503), never as a refusal.
 */
export type AuthCacheLookup<T> =
  { status: 'hit'; value: T } | { status: 'miss' } | { status: 'unavailable' }

const CACHE_MISS = { status: 'miss' } as const

/**
 * Redis cache service for authentication and organization context.
 * Implements the second tier of the three-tier caching architecture:
 * 1. Request-level cache (req.organizationContext)
 * 2. Redis cache (this service) - 10-15 min TTL
 * 3. DataLoader (auth-loader.service.ts) - batches DB queries
 */
@Injectable()
export class AuthCacheService {
  private readonly logger = new Logger(AuthCacheService.name)
  private readonly redis: Redis | null

  // Cache key prefixes
  private readonly PREFIX = {
    SESSION: 'auth:session:',
    MEMBERSHIP: 'auth:membership:',
    USER_ACTIVE_ORG: 'auth:user-active-org:',
    USER: 'auth:user:',
  }

  // TTLs in seconds
  private readonly TTL = {
    SESSION: 15 * 60, // 15 minutes
    MEMBERSHIP: 10 * 60, // 10 minutes
    USER_ACTIVE_ORG: 15 * 60, // 15 minutes
    USER: 10 * 60, // 10 minutes
  }

  constructor(@Optional() redis?: Redis) {
    // Create Redis client if not injected and env vars are available
    if (redis) {
      this.redis = redis
    } else {
      const redisUrl = process.env['REDIS_URL'] ?? process.env['REDIS_PRIVATE_URL'] ?? ''
      const redisPassword = process.env['REDIS_PASSWORD'] ?? ''

      if (redisUrl && !redisUrl.includes('localhost') && redisUrl.length > 10) {
        const secure = /rediss:/.test(redisUrl)
        try {
          this.redis = new Redis(redisUrl, {
            ...(redisPassword && { password: redisPassword }),
            ...(secure && { tls: { rejectUnauthorized: false } }),
            family: 6, // IPv6 for Railway private networking
            ...AUTH_CACHE_REDIS_TIMEOUTS,
            lazyConnect: true,
          })
          this.redis.on('error', err => {
            this.logger.warn(`Redis cache error: ${err.message}`)
          })
          this.logger.log('Auth cache service initialized with Redis')
          this.reportConnectionStatus(this.redis)
        } catch {
          // Redis initialization can fail in environments without Redis configured.
          // This is expected - fall back to caching disabled.
          this.logger.warn('Failed to initialize Redis for auth cache, caching disabled')
          this.redis = null
        }
      } else {
        this.logger.warn('No Redis URL configured, auth caching disabled')
        this.redis = null
      }
    }
  }

  /**
   * Connects once at boot and logs the outcome, so a deployment shows whether the auth cache reached
   * Redis. The error is ioredis's own message (host and port at most), never the URL or password.
   * A failure leaves the client in place: ioredis keeps reconnecting, and every read falls through.
   */
  private reportConnectionStatus(redis: Redis): void {
    redis.connect().then(
      () => this.logger.log('Auth cache Redis connected'),
      (error: unknown) =>
        this.logger.warn(
          `Auth cache Redis connection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ),
    )
  }

  /**
   * Check if caching is available
   */
  isEnabled(): boolean {
    return this.redis !== null
  }

  /** Reads `key` and parses it; see AuthCacheLookup. */
  private async lookup<T>(
    key: string,
    parse: (value: string) => T,
    what: string,
  ): Promise<AuthCacheLookup<T>> {
    if (!this.redis) return CACHE_MISS
    try {
      const value = await this.redis.get(key)
      if (value === null) return CACHE_MISS
      return { status: 'hit', value: parse(value) }
    } catch (error) {
      this.logger.warn(`Failed to get cached ${what}: ${(error as Error).message}`)
      return { status: 'unavailable' }
    }
  }

  // ==================== Session Methods ====================

  /**
   * Cache session validity status, as just read from the database.
   *
   * A "valid" result only fills an empty key (SET NX). The read behind it may predate a
   * revocation whose tombstone (see invalidateSession) is already in place, and that tombstone
   * must win. Session revocation is terminal, so an "invalid" result always overwrites.
   */
  async setSessionValid(sessionId: string, isValid: boolean): Promise<void> {
    if (!this.redis) return
    try {
      const key = `${this.PREFIX.SESSION}${sessionId}`
      if (isValid) {
        await this.redis.set(key, '1', 'EX', this.TTL.SESSION, 'NX')
      } else {
        await this.redis.setex(key, this.TTL.SESSION, '0')
      }
    } catch (error) {
      this.logger.warn(`Failed to cache session: ${(error as Error).message}`)
    }
  }

  /**
   * Cached session validity: a hit, a miss, or Redis unavailable. A caller deciding whether a
   * session is alive reads the database on `miss` and on `unavailable`; `unavailable` is never
   * "invalid session" (a 401 would log the user out over a Redis outage).
   */
  lookupSessionValid(sessionId: string): Promise<AuthCacheLookup<boolean>> {
    return this.lookup(`${this.PREFIX.SESSION}${sessionId}`, value => value === '1', 'session')
  }

  /**
   * Get cached session validity: null when not cached OR when Redis failed, so null means "ask the
   * database", never "invalid". Use lookupSessionValid to tell the two apart.
   */
  async getSessionValid(sessionId: string): Promise<boolean | null> {
    return valueOrNull(await this.lookupSessionValid(sessionId))
  }

  /**
   * Invalidate a session (e.g., on logout). Call after the revocation commits.
   *
   * Writes an "invalid" tombstone rather than deleting the key: after a delete, a request that read
   * the session as valid before the commit could still write "valid" back. setSessionValid never
   * overwrites the tombstone, which lives for the session TTL, far longer than any such request.
   */
  async invalidateSession(sessionId: string): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.setex(`${this.PREFIX.SESSION}${sessionId}`, this.TTL.SESSION, '0')
    } catch (error) {
      this.logger.warn(`Failed to invalidate session: ${(error as Error).message}`)
    }
  }

  // ==================== Membership Methods ====================

  /**
   * Cache organization membership context
   */
  async setMembership(
    userId: string,
    organizationId: string,
    context: OrganizationContext,
  ): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.setex(
        `${this.PREFIX.MEMBERSHIP}${userId}:${organizationId}`,
        this.TTL.MEMBERSHIP,
        JSON.stringify(context),
      )
    } catch (error) {
      this.logger.warn(`Failed to cache membership: ${(error as Error).message}`)
    }
  }

  /** Cached membership context: a hit, a miss, or Redis unavailable (never "not a member"). */
  lookupMembership(
    userId: string,
    organizationId: string,
  ): Promise<AuthCacheLookup<OrganizationContext>> {
    return this.lookup(
      `${this.PREFIX.MEMBERSHIP}${userId}:${organizationId}`,
      value => JSON.parse(value) as OrganizationContext,
      'membership',
    )
  }

  /**
   * Get cached membership context: null when not cached OR when Redis failed, so null means "ask
   * the database", never "not a member". Use lookupMembership to tell the two apart.
   */
  async getMembership(userId: string, organizationId: string): Promise<OrganizationContext | null> {
    return valueOrNull(await this.lookupMembership(userId, organizationId))
  }

  /**
   * Invalidate a specific membership (e.g., when role changes)
   */
  async invalidateMembership(userId: string, organizationId: string): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.del(`${this.PREFIX.MEMBERSHIP}${userId}:${organizationId}`)
    } catch (error) {
      this.logger.warn(`Failed to invalidate membership: ${(error as Error).message}`)
    }
  }

  /**
   * Invalidate all memberships for a user (e.g., when user leaves all orgs)
   */
  async invalidateUserMemberships(userId: string): Promise<void> {
    if (!this.redis) return
    try {
      const pattern = `${this.PREFIX.MEMBERSHIP}${userId}:*`
      const keys = await this.redis.keys(pattern)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } catch (error) {
      this.logger.warn(`Failed to invalidate user memberships: ${(error as Error).message}`)
    }
  }

  /**
   * Invalidate all memberships in an organization (e.g., when role permissions change)
   */
  async invalidateOrganizationMemberships(organizationId: string): Promise<void> {
    if (!this.redis) return
    try {
      const pattern = `${this.PREFIX.MEMBERSHIP}*:${organizationId}`
      const keys = await this.redis.keys(pattern)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } catch (error) {
      this.logger.warn(`Failed to invalidate org memberships: ${(error as Error).message}`)
    }
  }

  // ==================== User Active Organization Methods ====================

  /**
   * Cache user's active organization ID
   */
  async setUserActiveOrganization(userId: string, organizationId: string): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.setex(
        `${this.PREFIX.USER_ACTIVE_ORG}${userId}`,
        this.TTL.USER_ACTIVE_ORG,
        organizationId,
      )
    } catch (error) {
      this.logger.warn(`Failed to cache user active org: ${(error as Error).message}`)
    }
  }

  /** The cached active organization id: a hit, a miss, or Redis unavailable. */
  lookupUserActiveOrganization(userId: string): Promise<AuthCacheLookup<string>> {
    return this.lookup(`${this.PREFIX.USER_ACTIVE_ORG}${userId}`, value => value, 'user active org')
  }

  /**
   * Get cached user's active organization ID: null when not cached OR when Redis failed. Use
   * lookupUserActiveOrganization where "no organization" and "could not tell" must differ.
   */
  async getUserActiveOrganization(userId: string): Promise<string | null> {
    return valueOrNull(await this.lookupUserActiveOrganization(userId))
  }

  /**
   * Invalidate user's active organization cache (e.g., when switching orgs)
   */
  async invalidateUserActiveOrganization(userId: string): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.del(`${this.PREFIX.USER_ACTIVE_ORG}${userId}`)
    } catch (error) {
      this.logger.warn(`Failed to invalidate user active org: ${(error as Error).message}`)
    }
  }

  // ==================== User Methods ====================

  /**
   * Cache user data
   */
  async setUser(userId: string, userData: Record<string, unknown>): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.setex(
        `${this.PREFIX.USER}${userId}`,
        this.TTL.USER,
        JSON.stringify(userData),
      )
    } catch (error) {
      this.logger.warn(`Failed to cache user: ${(error as Error).message}`)
    }
  }

  /** Cached user data: a hit, a miss, or Redis unavailable (never "no such user"). */
  lookupUser(userId: string): Promise<AuthCacheLookup<Record<string, unknown>>> {
    return this.lookup(
      `${this.PREFIX.USER}${userId}`,
      value => JSON.parse(value) as Record<string, unknown>,
      'user',
    )
  }

  /**
   * Get cached user data: null when not cached OR when Redis failed, so null means "ask the
   * database", never "no such user". Use lookupUser to tell the two apart.
   */
  async getUser(userId: string): Promise<Record<string, unknown> | null> {
    return valueOrNull(await this.lookupUser(userId))
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(userId: string): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.del(`${this.PREFIX.USER}${userId}`)
    } catch (error) {
      this.logger.warn(`Failed to invalidate user: ${(error as Error).message}`)
    }
  }

  // ==================== Role Methods ====================

  /**
   * Invalidate all caches related to a role change in an organization
   * Call this when a role is modified or deleted
   */
  async invalidateRole(organizationId: string): Promise<void> {
    // Role changes affect all memberships in the organization
    await this.invalidateOrganizationMemberships(organizationId)
  }
}

function valueOrNull<T>(lookup: AuthCacheLookup<T>): T | null {
  return lookup.status === 'hit' ? lookup.value : null
}
