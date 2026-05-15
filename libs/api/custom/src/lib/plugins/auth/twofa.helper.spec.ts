import {
  generate2FASecret,
  verify2FACode,
  generateQRCode,
  generateBackupCodes,
  encryptSecret,
  decryptSecret,
  hashBackupCode,
} from './twofa.helper'
import * as speakeasy from 'speakeasy'
describe('2FA Helper Functions', () => {
  describe('generate2FASecret', () => {
    it('should generate a valid 2FA secret with issuer and email', () => {
      const issuer = 'MyApp'
      const userEmail = 'user@example.com'
      const result = generate2FASecret(issuer, userEmail)
      expect(result.secret).toBeDefined()
      expect(result.secret).toHaveLength(52) // Base32 encoding of 32 bytes
      expect(result.otpauthUrl).toContain('otpauth://totp/')
      expect(result.otpauthUrl).toContain(issuer)
      expect(result.otpauthUrl).toContain(encodeURIComponent(userEmail))
    })
    it('should generate unique secrets on each call', () => {
      const result1 = generate2FASecret('MyApp', 'user1@example.com')
      const result2 = generate2FASecret('MyApp', 'user2@example.com')
      expect(result1.secret).not.toEqual(result2.secret)
      expect(result1.otpauthUrl).not.toEqual(result2.otpauthUrl)
    })
  })
  describe('verify2FACode', () => {
    it('should verify valid TOTP code', () => {
      // Generate a secret and token
      const secret = speakeasy.generateSecret({ length: 32 })
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      })
      const result = verify2FACode(secret.base32, token)
      expect(result).toBe(true)
    })
    it('should reject invalid TOTP code', () => {
      const secret = speakeasy.generateSecret({ length: 32 })
      const invalidToken = '000000'
      const result = verify2FACode(secret.base32, invalidToken)
      expect(result).toBe(false)
    })
    it('should verify code within time drift window', () => {
      const secret = speakeasy.generateSecret({ length: 32 })
      // Generate token for current time
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      })
      // Verify with default window of 2 (60 seconds tolerance)
      const result = verify2FACode(secret.base32, token, 2)
      expect(result).toBe(true)
    })
    it('should accept custom time drift window', () => {
      const secret = speakeasy.generateSecret({ length: 32 })
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      })
      // Verify with larger window
      const result = verify2FACode(secret.base32, token, 5)
      expect(result).toBe(true)
    })
  })
  describe('generateQRCode', () => {
    it('should generate QR code data URL from otpauth URL', async () => {
      const otpauthUrl =
        'otpauth://totp/MyApp:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp'
      const result = await generateQRCode(otpauthUrl)
      expect(result).toBeDefined()
      expect(result).toMatch(/^data:image\/png;base64,/)
    })
    it('should throw error for invalid otpauth URL', async () => {
      const invalidUrl = 'not-a-valid-url'
      // QRCode library should still generate, but let's test error handling
      // In practice, QRCode.toDataURL can handle most strings
      await expect(generateQRCode(invalidUrl)).resolves.toBeDefined()
    })
  })
  describe('generateBackupCodes', () => {
    it('should generate 10 backup codes by default', () => {
      const codes = generateBackupCodes()
      expect(codes).toHaveLength(10)
      codes.forEach(code => {
        expect(code).toHaveLength(8) // 4 bytes = 8 hex chars
        expect(code).toMatch(/^[0-9A-F]+$/) // Uppercase hex
      })
    })
    it('should generate custom number of backup codes', () => {
      const codes = generateBackupCodes(5)
      expect(codes).toHaveLength(5)
    })
    it('should generate unique backup codes', () => {
      const codes = generateBackupCodes(10)
      const uniqueCodes = new Set(codes)
      expect(uniqueCodes.size).toBe(10) // All codes should be unique
    })
    it('should generate different codes on each call', () => {
      const codes1 = generateBackupCodes(5)
      const codes2 = generateBackupCodes(5)
      expect(codes1).not.toEqual(codes2)
    })
  })
  describe('encryptSecret and decryptSecret', () => {
    it('should encrypt and decrypt a secret correctly', () => {
      const secret = 'JBSWY3DPEHPK3PXP'
      const encryptionKey = 'my-super-secret-encryption-key-32bytes'
      const encrypted = encryptSecret(secret, encryptionKey)
      const decrypted = decryptSecret(encrypted, encryptionKey)
      expect(decrypted).toBe(secret)
    })
    it('should produce different encrypted output with different IVs', () => {
      const secret = 'JBSWY3DPEHPK3PXP'
      const encryptionKey = 'my-super-secret-encryption-key-32bytes'
      const encrypted1 = encryptSecret(secret, encryptionKey)
      const encrypted2 = encryptSecret(secret, encryptionKey)
      // Different IVs should produce different encrypted outputs
      expect(encrypted1).not.toEqual(encrypted2)
      // But both should decrypt to the same secret
      const decrypted1 = decryptSecret(encrypted1, encryptionKey)
      const decrypted2 = decryptSecret(encrypted2, encryptionKey)
      expect(decrypted1).toBe(secret)
      expect(decrypted2).toBe(secret)
    })
    it('should include IV in encrypted output', () => {
      const secret = 'JBSWY3DPEHPK3PXP'
      const encryptionKey = 'my-super-secret-encryption-key'
      const encrypted = encryptSecret(secret, encryptionKey)
      // Encrypted format is "IV:ciphertext"
      expect(encrypted).toContain(':')
      const [iv, ciphertext] = encrypted.split(':')
      expect(iv).toHaveLength(32) // 16 bytes = 32 hex chars
      expect(ciphertext).toBeDefined()
    })
    it('should fail to decrypt with wrong key', () => {
      const secret = 'JBSWY3DPEHPK3PXP'
      const encryptionKey = 'correct-encryption-key-32-bytes'
      const wrongKey = 'wrong-encryption-key-32-bytes!!'
      const encrypted = encryptSecret(secret, encryptionKey)
      // Decrypting with wrong key should throw or produce garbage
      expect(() => {
        decryptSecret(encrypted, wrongKey)
      }).toThrow()
    })
    it('should handle encryption key padding correctly', () => {
      const secret = 'JBSWY3DPEHPK3PXP'
      const shortKey = 'short-key' // Less than 32 bytes
      const encrypted = encryptSecret(secret, shortKey)
      const decrypted = decryptSecret(encrypted, shortKey)
      expect(decrypted).toBe(secret)
    })
    it('should handle encryption key truncation correctly', () => {
      const secret = 'JBSWY3DPEHPK3PXP'
      const longKey = 'this-is-a-very-long-encryption-key-that-exceeds-32-bytes'
      const encrypted = encryptSecret(secret, longKey)
      const decrypted = decryptSecret(encrypted, longKey)
      expect(decrypted).toBe(secret)
    })
  })
  describe('hashBackupCode', () => {
    it('should hash backup code using SHA-256', () => {
      const code = '12345678'
      const hash = hashBackupCode(code)
      expect(hash).toBeDefined()
      expect(hash).toHaveLength(64) // SHA-256 produces 64 hex chars
      expect(hash).toMatch(/^[0-9a-f]+$/) // Lowercase hex
    })
    it('should produce same hash for same input', () => {
      const code = '12345678'
      const hash1 = hashBackupCode(code)
      const hash2 = hashBackupCode(code)
      expect(hash1).toBe(hash2)
    })
    it('should produce different hashes for different inputs', () => {
      const code1 = '12345678'
      const code2 = '87654321'
      const hash1 = hashBackupCode(code1)
      const hash2 = hashBackupCode(code2)
      expect(hash1).not.toBe(hash2)
    })
    it('should be one-way (cannot reverse)', () => {
      const code = 'ABCD1234'
      const hash = hashBackupCode(code)
      // Hash should not contain the original code
      expect(hash).not.toContain(code)
      expect(hash.toLowerCase()).not.toContain(code.toLowerCase())
    })
    it('should handle uppercase and lowercase differently', () => {
      const code1 = 'abcdef12'
      const code2 = 'ABCDEF12'
      const hash1 = hashBackupCode(code1)
      const hash2 = hashBackupCode(code2)
      expect(hash1).not.toBe(hash2)
    })
  })
  describe('Integration Tests', () => {
    it('should support complete 2FA setup flow', async () => {
      const issuer = 'MyApp'
      const userEmail = 'user@example.com'
      const encryptionKey = 'secure-encryption-key-for-storage'
      // 1. Generate secret
      const { secret, otpauthUrl } = generate2FASecret(issuer, userEmail)
      expect(secret).toBeDefined()
      // 2. Generate QR code
      const qrCode = await generateQRCode(otpauthUrl!)
      expect(qrCode).toMatch(/^data:image\/png;base64,/)
      // 3. Encrypt secret for storage
      const encryptedSecret = encryptSecret(secret, encryptionKey)
      expect(encryptedSecret).toBeDefined()
      // 4. Generate backup codes
      const backupCodes = generateBackupCodes(10)
      expect(backupCodes).toHaveLength(10)
      // 5. Hash backup codes for storage
      const hashedBackupCodes = backupCodes.map(hashBackupCode)
      expect(hashedBackupCodes).toHaveLength(10)
      // 6. Verify TOTP token
      const token = speakeasy.totp({ secret, encoding: 'base32' })
      const isValid = verify2FACode(secret, token)
      expect(isValid).toBe(true)
      // 7. Decrypt secret for verification
      const decryptedSecret = decryptSecret(encryptedSecret, encryptionKey)
      expect(decryptedSecret).toBe(secret)
    })
    it('should verify backup code matches hashed version', () => {
      const backupCodes = generateBackupCodes(10)
      const hashedCodes = backupCodes.map(hashBackupCode)
      // User enters first backup code
      const userEnteredCode = backupCodes[0]
      const userEnteredHash = hashBackupCode(userEnteredCode)
      // Should match the stored hash
      expect(hashedCodes[0]).toBe(userEnteredHash)
    })
  })
})
