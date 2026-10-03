import * as speakeasy from 'speakeasy'
import * as QRCode from 'qrcode'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

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
    throw new Error(`Failed to generate QR code: ${(error as Error).message}`)
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
 * Encrypt a 2FA secret for storage using AES-256-GCM (authenticated encryption).
 * Output format: <12-byte iv hex>:<16-byte auth tag hex>:<ciphertext hex>
 */
export function encryptSecret(secret: string, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey.slice(0, 32).padEnd(32, '0'))
  const iv = randomBytes(12) // GCM standard: 96-bit IV
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypt a 2FA secret from storage.
 * Supports GCM format (iv:authTag:ciphertext) and legacy CBC format (iv:ciphertext).
 */
export function decryptSecret(encryptedSecret: string, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey.slice(0, 32).padEnd(32, '0'))
  const parts = encryptedSecret.split(':')

  if (parts.length === 3) {
    // GCM format: iv(24 hex):authTag(32 hex):ciphertext
    const [ivHex, authTagHex, ciphertextHex] = parts
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]).toString('utf8')
  }

  // Legacy CBC format: iv(32 hex):ciphertext — decrypts existing secrets before migration
  const [ivHex, ciphertextHex] = parts
  const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'))
  return decipher.update(ciphertextHex, 'hex', 'utf8') + decipher.final('utf8')
}

/**
 * Hash a backup code for storage (one-way hash)
 */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}
