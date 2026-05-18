import { Injectable, Logger, Scope } from '@nestjs/common'
import DataLoader from 'dataloader'
import { OrganizationContext } from '../types/nest-context-type'
import { AuthCacheService } from './auth-cache.service'

/**
 * Keys for the membership DataLoader
 */
interface MembershipKey {
  userId: string
  organizationId: string
}

/**
 * Result from database query for membership
 */
interface MembershipResult {
  userId: string
  organizationId: string
  roleId: string
  role: {
    name: string
    permissions: Array<{
      subject: string
      action: string
    }>
  }
}

/**
 * DataLoader service for batching and caching authentication data lookups.
 * Implements the third tier of the three-tier caching architecture:
 * 1. Request-level cache (req.organizationContext)
 * 2. Redis cache (auth-cache.service.ts)
 * 3. DataLoader (this service) - batches within a single request
 *
 * Note: This service is request-scoped to ensure DataLoader caches are isolated per request.
 */
@Injectable({ scope: Scope.REQUEST })
export class AuthLoaderService {
  private readonly logger = new Logger(AuthLoaderService.name)
  private readonly membershipLoader: DataLoader<MembershipKey, OrganizationContext | null, string>

  constructor(
    private readonly authCache: AuthCacheService,
    // We need the data service to be injected via factory, not constructor
    // to avoid circular dependencies. The caller should provide it.
    private readonly queryMemberships?: (
      keys: readonly MembershipKey[],
    ) => Promise<MembershipResult[]>,
  ) {
    this.membershipLoader = new DataLoader<MembershipKey, OrganizationContext | null, string>(
      keys => this.batchLoadMemberships(keys),
      {
        // Use a custom cache key since the key is an object
        cacheKeyFn: key => `${key.userId}:${key.organizationId}`,
      },
    )
  }

  /**
   * Load membership context for a user in an organization.
   * Uses DataLoader for batching and request-level caching.
   *
   * @param userId - The user ID
   * @param organizationId - The organization ID (optional, will use active org if not provided)
   * @returns OrganizationContext or null if not a member
   */
  async loadMembership(
    userId: string,
    organizationId?: string,
  ): Promise<OrganizationContext | null> {
    if (!organizationId) {
      // Try to get from Redis cache
      const cachedOrgId = await this.authCache.getUserActiveOrganization(userId)
      if (cachedOrgId) {
        organizationId = cachedOrgId
      } else {
        // No organization context available
        return null
      }
    }

    // First check Redis cache
    const cachedContext = await this.authCache.getMembership(userId, organizationId)
    if (cachedContext) {
      this.logger.debug(`Membership cache hit for ${userId}:${organizationId}`)
      return cachedContext
    }

    // Use DataLoader for batching
    return this.membershipLoader.load({ userId, organizationId })
  }

  /**
   * Batch load memberships - called by DataLoader.
   * Batches multiple membership lookups into a single database query.
   */
  private async batchLoadMemberships(
    keys: readonly MembershipKey[],
  ): Promise<(OrganizationContext | null)[]> {
    if (!this.queryMemberships) {
      this.logger.warn('No queryMemberships function provided, returning nulls')
      return keys.map(() => null)
    }

    try {
      // Execute batch query
      const results = await this.queryMemberships(keys)

      // Create a map for quick lookup
      const resultMap = new Map<string, MembershipResult>()
      for (const result of results) {
        resultMap.set(`${result.userId}:${result.organizationId}`, result)
      }

      // Map results back to the original key order (DataLoader requirement)
      const contexts = keys.map(key => {
        const result = resultMap.get(`${key.userId}:${key.organizationId}`)
        if (!result) {
          return null
        }

        const context: OrganizationContext = {
          organizationId: result.organizationId,
          userId: result.userId,
          roleId: result.roleId,
          roleName: result.role.name,
          permissions: result.role.permissions.map(p => ({
            subject: p.subject,
            action: p.action,
          })),
        }

        // Cache in Redis for subsequent requests
        this.authCache.setMembership(key.userId, key.organizationId, context).catch(err => {
          this.logger.warn(`Failed to cache membership: ${err.message}`)
        })

        return context
      })

      return contexts
    } catch (error) {
      this.logger.error(`Failed to batch load memberships: ${(error as Error).message}`)
      return keys.map(() => null)
    }
  }

  /**
   * Prime the cache with a known membership context.
   * Useful when you've already loaded the membership from another source.
   */
  primeMembership(userId: string, organizationId: string, context: OrganizationContext): void {
    this.membershipLoader.prime({ userId, organizationId }, context)
    // Also cache in Redis
    this.authCache.setMembership(userId, organizationId, context).catch(err => {
      this.logger.warn(`Failed to prime Redis cache: ${err.message}`)
    })
  }

  /**
   * Clear the cache for a specific membership.
   * Call this when a membership changes.
   */
  clearMembership(userId: string, organizationId: string): void {
    this.membershipLoader.clear({ userId, organizationId })
    this.authCache.invalidateMembership(userId, organizationId).catch(err => {
      this.logger.warn(`Failed to clear Redis cache: ${err.message}`)
    })
  }

  /**
   * Clear all cached memberships.
   */
  clearAll(): void {
    this.membershipLoader.clearAll()
  }
}

/**
 * Factory function to create AuthLoaderService with database query function.
 * Use this in your module to provide the service with proper dependencies.
 *
 * Example:
 * ```typescript
 * {
 *   provide: AuthLoaderService,
 *   useFactory: (authCache: AuthCacheService, data: ApiCoreDataAccessService) => {
 *     return createAuthLoaderService(authCache, async (keys) => {
 *       return data.organizationMember.findMany({
 *         where: {
 *           OR: keys.map(k => ({ userId: k.userId, organizationId: k.organizationId })),
 *         },
 *         include: {
 *           role: { include: { permissions: true } },
 *         },
 *       })
 *     })
 *   },
 *   inject: [AuthCacheService, ApiCoreDataAccessService],
 *   scope: Scope.REQUEST,
 * }
 * ```
 */
export function createAuthLoaderService(
  authCache: AuthCacheService,
  queryMemberships: (keys: readonly MembershipKey[]) => Promise<MembershipResult[]>,
): AuthLoaderService {
  return new AuthLoaderService(authCache, queryMemberships)
}
