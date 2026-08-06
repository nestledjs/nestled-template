import { SetMetadata } from '@nestjs/common'

export const AUTH_LEVEL_KEY = 'nestled:authLevel'

/**
 * The access level an operation declares for itself.
 *
 * This exists because NestJS registers no default: an operation with no guard is reachable by an
 * anonymous request, and absence of a decorator is indistinguishable from someone forgetting one.
 * Declaring the level makes intent explicit and reviewable, so `GlobalAuthGuard` can refuse anything
 * undeclared instead of guessing from whichever guards happen to be attached.
 */
export type AuthLevel = 'public' | 'authenticated' | 'admin'

/**
 * Reachable without authentication, on purpose.
 *
 * Every use is a deliberate decision that belongs in review — login and the other pre-authentication
 * flows, health checks, and provider callbacks that arrive before a session exists.
 */
export const Public = () => SetMetadata(AUTH_LEVEL_KEY, 'public' satisfies AuthLevel)

/**
 * Requires a signed-in user. Pair with the guard that performs the check, normally `GqlAuthGuard`.
 * This decorator declares intent; it does not authenticate on its own.
 */
export const Authenticated = () => SetMetadata(AUTH_LEVEL_KEY, 'authenticated' satisfies AuthLevel)

/**
 * Requires a super admin. Pair with `GqlAuthAdminGuard`.
 */
export const AdminOnly = () => SetMetadata(AUTH_LEVEL_KEY, 'admin' satisfies AuthLevel)
