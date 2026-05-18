import { Injectable, Logger, Optional } from '@nestjs/common'
import Redis from 'ioredis'
import { OrganizationContext } from '../types/nest-context-type'

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
            maxRetriesPerRequest: 3,
            lazyConnect: true,
          })
          this.redis.on('error', err => {
            this.logger.warn(`Redis cache error: ${err.message}`)
          })
          this.logger.log('Auth cache service initialized with Redis')
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
   * Check if caching is available
   */
  isEnabled(): boolean {
    return this.redis !== null
  }

  // ==================== Session Methods ====================

  /**
   * Cache session validity status
   */
  async setSessionValid(sessionId: string, isValid: boolean): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.setex(
        `${this.PREFIX.SESSION}${sessionId}`,
        this.TTL.SESSION,
        isValid ? '1' : '0',
      )
    } catch (error) {
      this.logger.warn(`Failed to cache session: ${(error as Error).message}`)
    }
  }

  /**
   * Get cached session validity (returns null if not cached)
   */
  async getSessionValid(sessionId: string): Promise<boolean | null> {
    if (!this.redis) return null
    try {
      const value = await this.redis.get(`${this.PREFIX.SESSION}${sessionId}`)
      if (value === null) return null
      return value === '1'
    } catch (error) {
      this.logger.warn(`Failed to get cached session: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Invalidate a session (e.g., on logout)
   */
  async invalidateSession(sessionId: string): Promise<void> {
    if (!this.redis) return
    try {
      await this.redis.del(`${this.PREFIX.SESSION}${sessionId}`)
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

  /**
   * Get cached membership context (returns null if not cached)
   */
  async getMembership(userId: string, organizationId: string): Promise<OrganizationContext | null> {
    if (!this.redis) return null
    try {
      const value = await this.redis.get(`${this.PREFIX.MEMBERSHIP}${userId}:${organizationId}`)
      if (value === null) return null
      return JSON.parse(value) as OrganizationContext
    } catch (error) {
      this.logger.warn(`Failed to get cached membership: ${(error as Error).message}`)
      return null
    }
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

  /**
   * Get cached user's active organization ID
   */
  async getUserActiveOrganization(userId: string): Promise<string | null> {
    if (!this.redis) return null
    try {
      return await this.redis.get(`${this.PREFIX.USER_ACTIVE_ORG}${userId}`)
    } catch (error) {
      this.logger.warn(`Failed to get cached user active org: ${(error as Error).message}`)
      return null
    }
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

  /**
   * Get cached user data
   */
  async getUser(userId: string): Promise<Record<string, unknown> | null> {
    if (!this.redis) return null
    try {
      const value = await this.redis.get(`${this.PREFIX.USER}${userId}`)
      if (value === null) return null
      return JSON.parse(value)
    } catch (error) {
      this.logger.warn(`Failed to get cached user: ${(error as Error).message}`)
      return null
    }
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
