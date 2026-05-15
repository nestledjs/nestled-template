import * as speakeasy from 'speakeasy'
import * as QRCode from 'qrcode'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Generate a new TOTP secret for 2FA
 */
export function generate2FASecret(issuer: string, userEmail: string) {
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${userEmail})`,
    issuer,
    length: 32,
  })

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
  }
}

/**
 * Verify a TOTP code against a secret
 */
export function verify2FACode(secret: string, token: string, window = 2): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window, // Allow time drift (2 = 60 seconds tolerance)
  })
}

/**
 * Generate QR code data URL for TOTP setup
 */
export async function generateQRCode(otpauthUrl: string): Promise<string> {
  try {
    return await QRCode.toDataURL(otpauthUrl)
  } catch (error) {
    throw new Error('Failed to generate QR code')
  }
}

/**
 * Generate backup codes for 2FA recovery
 * Returns array of 10 random 8-character codes
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase()
    codes.push(code)
  }
  return codes
}

/**
 * Encrypt a 2FA secret for storage
 */
export function encryptSecret(secret: string, encryptionKey: string): string {
  // Ensure encryption key is 32 bytes
  const key = Buffer.from(encryptionKey.slice(0, 32).padEnd(32, '0'))
  const iv = randomBytes(16)

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(secret, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  // Return IV + encrypted data
  return iv.toString('hex') + ':' + encrypted
}

/**
 * Decrypt a 2FA secret from storage
 */
export function decryptSecret(encryptedSecret: string, encryptionKey: string): string {
  // Ensure encryption key is 32 bytes
  const key = Buffer.from(encryptionKey.slice(0, 32).padEnd(32, '0'))

  const [ivHex, encrypted] = encryptedSecret.split(':')
  const iv = Buffer.from(ivHex, 'hex')

  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Hash a backup code for storage (one-way hash)
 */
export function hashBackupCode(code: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(code).digest('hex')
}