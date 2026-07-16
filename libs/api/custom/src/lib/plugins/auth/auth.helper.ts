import { compareSync, hashSync } from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'

const getHash = (str: string): string => createHash('md5').update(str).digest('hex')

export const getGravatarUrl = (email = '') => {
  const gravatarUrl = 'https://www.gravatar.com/avatar/'
  const gravatarSize = 460
  return `${gravatarUrl}${getHash(email)}?s=${gravatarSize}&d=mp`
}

/**
 * Canonical form of an email address for storage, lookup, and delivery.
 *
 * Use this anywhere an address is both looked up and acted on: normalizing for the lookup but
 * keeping the raw value for the send finds the right user and then mails a malformed address.
 */
export function normalizeEmail(email: string | undefined | null): string {
  return email?.trim().toLowerCase() ?? ''
}

export function validatePassword(password: string, hashedPassword: string): boolean {
  return compareSync(password, hashedPassword)
}

export function hashPassword(password: string): string {
  return hashSync(password, 10)
}

export function generateMd5Hash(input: string): string {
  return getHash(input)
}

/**
 * Generate a cryptographically secure, unguessable token.
 *
 * Used for password-reset, email-verification and email-change links — all reachable via
 * unauthenticated public mutations. The previous implementation was `md5(randomId(24))` where
 * `randomId` returned `Date.now()` truncated, i.e. the current millisecond: an attacker who knows
 * server time (from the HTTP `Date` header) could brute-force the md5 over a few thousand candidate
 * milliseconds offline and forge a valid reset token. 32 bytes of CSPRNG entropy closes that.
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function generateExpireDate(days = 1) {
  return new Date(Date.now() + 60 * 60 * 24 * 1000 * days)
}

/**
 * Random hex string of `length` characters. Backed by a CSPRNG (was `Date.now()`-based, which is
 * predictable). Used for non-security-critical uniqueness such as username-slug suffixes.
 */
export function randomId(length = 8): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length)
}

/**
 * Generate a username slug from first and last name
 * Format: firstname.lastname (lowercase, alphanumeric only)
 */
export function generateUsernameSlug(firstName?: string, lastName?: string): string {
  const cleanFirst = (firstName || '').toLowerCase().replaceAll(/[^a-z0-9]/g, '') || 'user'
  const cleanLast = (lastName || '').toLowerCase().replaceAll(/[^a-z0-9]/g, '') || randomId(4)
  return `${cleanFirst}.${cleanLast}`
}

/**
 * Generate a unique username with a random suffix
 */
export function generateUsernameWithSuffix(baseUsername: string): string {
  const randomSuffix = Math.floor(Math.random() * 9999) + 1
  return `${baseUsername}${randomSuffix}`
}
