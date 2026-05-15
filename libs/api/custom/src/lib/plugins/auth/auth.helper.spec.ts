import {
  getGravatarUrl,
  validatePassword,
  hashPassword,
  generateMd5Hash,
  generateToken,
  generateExpireDate,
  randomId,
  generateUsernameSlug,
  generateUsernameWithSuffix,
} from './auth.helper'
describe('Auth Helper Functions', () => {
  describe('getGravatarUrl', () => {
    it('should generate gravatar URL for email', () => {
      const email = 'test@example.com'
      const url = getGravatarUrl(email)
      expect(url).toContain('https://www.gravatar.com/avatar/')
      expect(url).toContain('?s=460&d=mp')
    })
    it('should handle empty email', () => {
      const url = getGravatarUrl('')
      expect(url).toContain('https://www.gravatar.com/avatar/')
      expect(url).toContain('?s=460&d=mp')
    })
    it('should handle undefined email', () => {
      const url = getGravatarUrl(undefined)
      expect(url).toContain('https://www.gravatar.com/avatar/')
      expect(url).toContain('?s=460&d=mp')
    })
    it('should generate consistent hash for same email', () => {
      const email = 'user@test.com'
      const url1 = getGravatarUrl(email)
      const url2 = getGravatarUrl(email)
      expect(url1).toBe(url2)
    })
    it('should generate different hashes for different emails', () => {
      const url1 = getGravatarUrl('user1@test.com')
      const url2 = getGravatarUrl('user2@test.com')
      expect(url1).not.toBe(url2)
    })
  })
  describe('hashPassword and validatePassword', () => {
    it('should hash password', () => {
      const password = 'MyPassword123!'
      const hashed = hashPassword(password)
      expect(hashed).toBeDefined()
      expect(hashed).not.toBe(password)
      expect(hashed.length).toBeGreaterThan(20)
    })
    it('should validate correct password', () => {
      const password = 'MyPassword123!'
      const hashed = hashPassword(password)
      const isValid = validatePassword(password, hashed)
      expect(isValid).toBe(true)
    })
    it('should reject incorrect password', () => {
      const password = 'MyPassword123!'
      const wrongPassword = 'WrongPassword123!'
      const hashed = hashPassword(password)
      const isValid = validatePassword(wrongPassword, hashed)
      expect(isValid).toBe(false)
    })
    it('should generate different hashes for same password', () => {
      const password = 'MyPassword123!'
      const hash1 = hashPassword(password)
      const hash2 = hashPassword(password)
      // Hashes should be different due to salt
      expect(hash1).not.toBe(hash2)
      // But both should validate
      expect(validatePassword(password, hash1)).toBe(true)
      expect(validatePassword(password, hash2)).toBe(true)
    })
  })
  describe('generateMd5Hash', () => {
    it('should generate MD5 hash', () => {
      const input = 'test-string'
      const hash = generateMd5Hash(input)
      expect(hash).toBeDefined()
      expect(hash.length).toBe(32) // MD5 hash is 32 characters
    })
    it('should generate consistent hash for same input', () => {
      const input = 'consistent-input'
      const hash1 = generateMd5Hash(input)
      const hash2 = generateMd5Hash(input)
      expect(hash1).toBe(hash2)
    })
    it('should generate different hashes for different inputs', () => {
      const hash1 = generateMd5Hash('input1')
      const hash2 = generateMd5Hash('input2')
      expect(hash1).not.toBe(hash2)
    })
  })
  describe('generateToken', () => {
    it('should generate a token', () => {
      const token = generateToken()
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })
    it('should generate a valid token string', () => {
      const token = generateToken()
      // Token should be a 32-character MD5 hash
      expect(token).toMatch(/^[a-f0-9]{32}$/)
    })
  })
  describe('generateExpireDate', () => {
    it('should generate expire date 1 day in future by default', () => {
      const now = Date.now()
      const expireDate = generateExpireDate()
      const diffMs = expireDate.getTime() - now
      const diffHours = diffMs / (1000 * 60 * 60)
      expect(diffHours).toBeGreaterThan(23)
      expect(diffHours).toBeLessThan(25)
    })
    it('should generate expire date for custom days', () => {
      const days = 7
      const now = Date.now()
      const expireDate = generateExpireDate(days)
      const diffMs = expireDate.getTime() - now
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeGreaterThan(days - 0.1)
      expect(diffDays).toBeLessThan(days + 0.1)
    })
    it('should handle fractional days', () => {
      const days = 0.5 // 12 hours
      const now = Date.now()
      const expireDate = generateExpireDate(days)
      const diffMs = expireDate.getTime() - now
      const diffHours = diffMs / (1000 * 60 * 60)
      expect(diffHours).toBeGreaterThan(11)
      expect(diffHours).toBeLessThan(13)
    })
  })
  describe('randomId', () => {
    it('should generate random ID with default length', () => {
      const id = randomId()
      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id.length).toBe(8)
    })
    it('should generate random ID with custom length', () => {
      const length = 12
      const id = randomId(length)
      expect(id).toBeDefined()
      expect(id.length).toBeLessThanOrEqual(length)
    })
    it('should generate numeric string', () => {
      const id = randomId()
      expect(/^\d+$/.test(id)).toBe(true)
    })
  })
  describe('generateUsernameSlug', () => {
    it('should generate slug from first and last name', () => {
      const slug = generateUsernameSlug('John', 'Doe')
      expect(slug).toBe('john.doe')
    })
    it('should handle names with special characters', () => {
      const slug = generateUsernameSlug("O'Brien", 'Smith-Jones')
      expect(slug).toBe('obrien.smithjones')
    })
    it('should handle names with numbers', () => {
      const slug = generateUsernameSlug('John123', 'Doe456')
      expect(slug).toBe('john123.doe456')
    })
    it('should use default when first name is empty', () => {
      const slug = generateUsernameSlug('', 'Doe')
      expect(slug).toBe('user.doe')
    })
    it('should use random suffix when last name is empty', () => {
      const slug = generateUsernameSlug('John', '')
      expect(slug).toContain('john.')
      expect(slug.split('.')[1]).toMatch(/^\d+$/)
    })
    it('should handle undefined names', () => {
      const slug = generateUsernameSlug(undefined, undefined)
      expect(slug).toContain('user.')
      expect(slug.split('.')[1]).toMatch(/^\d+$/)
    })
    it('should lowercase all characters', () => {
      const slug = generateUsernameSlug('JOHN', 'DOE')
      expect(slug).toBe('john.doe')
    })
    it('should handle names with spaces', () => {
      const slug = generateUsernameSlug('John Paul', 'Van Doe')
      expect(slug).toBe('johnpaul.vandoe')
    })
  })
  describe('generateUsernameWithSuffix', () => {
    it('should add random suffix to username', () => {
      const base = 'john.doe'
      const username = generateUsernameWithSuffix(base)
      expect(username).toContain(base)
      expect(username.length).toBeGreaterThan(base.length)
    })
    it('should generate numeric suffix', () => {
      const base = 'user'
      const username = generateUsernameWithSuffix(base)
      const suffix = username.replace(base, '')
      expect(/^\d+$/.test(suffix)).toBe(true)
    })
    it('should generate suffix between 1 and 10000', () => {
      const base = 'test'
      const username = generateUsernameWithSuffix(base)
      const suffix = parseInt(username.replace(base, ''))
      expect(suffix).toBeGreaterThanOrEqual(1)
      expect(suffix).toBeLessThanOrEqual(10000)
    })
    it('should generate different suffixes on each call', () => {
      const base = 'user'
      const usernames = new Set()
      // Generate 10 usernames, at least some should be different
      for (let i = 0; i < 10; i++) {
        usernames.add(generateUsernameWithSuffix(base))
      }
      expect(usernames.size).toBeGreaterThan(1)
    })
  })
})
