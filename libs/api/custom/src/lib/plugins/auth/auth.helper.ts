import { compareSync, hashSync } from 'bcryptjs'
import { createHash } from 'crypto'

const getHash = (str: string): string => createHash('md5').update(str).digest('hex')

export const getGravatarUrl = (email = '') => {
  const gravatarUrl = 'https://www.gravatar.com/avatar/'
  const gravatarSize = 460
  return `${gravatarUrl}${getHash(email)}?s=${gravatarSize}&d=mp`
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

export function generateToken() {
  return generateMd5Hash(randomId(24))
}

export function generateExpireDate(days = 1) {
  return new Date(Date.now() + 60 * 60 * 24 * 1000 * days)
}

export function randomId(length = 8): string {
  return new Date().getTime().toString().substr(0, length)
}

/**
 * Generate a username slug from first and last name
 * Format: firstname.lastname (lowercase, alphanumeric only)
 */
export function generateUsernameSlug(firstName?: string, lastName?: string): string {
  const cleanFirst = (firstName || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'user'
  const cleanLast = (lastName || '').toLowerCase().replace(/[^a-z0-9]/g, '') || randomId(4)
  return `${cleanFirst}.${cleanLast}`
}

/**
 * Generate a unique username with a random suffix
 */
export function generateUsernameWithSuffix(baseUsername: string): string {
  const randomSuffix = Math.floor(Math.random() * 9999) + 1
  return `${baseUsername}${randomSuffix}`
}
