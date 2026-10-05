import type { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

/**
 * Claims the API puts in the JWTs it signs (session tokens and emulation tokens).
 *
 * `authGeneration` is the subject's `User.authGeneration` as read when the credential was checked.
 * Emulation tokens also carry `adminAuthGeneration`, the emulating admin's value, and a `sessionId`
 * owned by that admin. Tokens issued before the claim existed carry none; they read as 0, which is
 * every user's starting value, so deploying this does not sign anyone out.
 */
export type AuthTokenClaims = {
  userId: string
  sessionId?: string
  authGeneration?: number
  isEmulating?: boolean
  originalAdminId?: string
  adminAuthGeneration?: number
}

/** The generation a token was issued under. Missing or malformed reads as 0. */
export function claimedAuthGeneration(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : 0
}

type AuthTokenStore = Pick<ApiCoreDataAccessService, 'user' | 'userSession'>

/**
 * Whether a verified token's claims still hold: its generation matches the user's, its session (if
 * any) is valid and belongs to the right user, and, for an emulation token, the emulating admin's
 * generation still matches too. `user` is the token subject's row, already loaded by the caller.
 *
 * Signature and expiry are not checked here; pass only claims from a verified token.
 */
export async function isAuthTokenCurrent(
  data: AuthTokenStore,
  claims: AuthTokenClaims,
  user: { id: string; authGeneration: number },
): Promise<boolean> {
  if (claimedAuthGeneration(claims.authGeneration) !== user.authGeneration) {
    return false
  }

  // An emulation token's session belongs to the admin, so revoking the admin's sessions ends it.
  const sessionOwnerId = claims.isEmulating ? claims.originalAdminId : user.id

  if (claims.isEmulating) {
    // Emulation tokens must be revocable: without a session there is nothing to revoke.
    if (!claims.originalAdminId || !claims.sessionId) {
      return false
    }
    const admin = await data.user.findUnique({
      where: { id: claims.originalAdminId },
      select: { authGeneration: true },
    })
    if (!admin || admin.authGeneration !== claimedAuthGeneration(claims.adminAuthGeneration)) {
      return false
    }
  }

  if (claims.sessionId) {
    const session = await data.userSession.findUnique({
      where: { id: claims.sessionId },
      select: { isValid: true, userId: true, expiresAt: true },
    })
    if (session?.isValid !== true || session.userId !== sessionOwnerId) {
      return false
    }
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      return false
    }
  }

  return true
}
