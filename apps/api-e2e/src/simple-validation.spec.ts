import { describe, it, expect } from 'vitest'
import { UserFactory } from './support/factories/user.factory'
describe('Simple Test Infrastructure Validation', () => {
  it('should be able to create test data with factories', () => {
    const userData = UserFactory.create()
    expect(userData.firstName).toBeDefined()
    expect(userData.lastName).toBeDefined()
    expect(userData.email).toContain('@')
    expect(userData.password).toBeDefined()
    expect(typeof userData.verified).toBe('boolean')
  })
  it('should generate unique test emails', () => {
    const user1 = UserFactory.create()
    const user2 = UserFactory.create()
    expect(user1.email).not.toBe(user2.email)
  })
  it('should create multiple unique users', () => {
    const users = UserFactory.createMany(3)
    expect(users).toHaveLength(3)
    const emails = users.map(u => u.email)
    const uniqueEmails = [...new Set(emails)]
    expect(uniqueEmails).toHaveLength(3) // All emails should be unique
  })
  it('should create admin user with correct properties', () => {
    const admin = UserFactory.createAdmin({
      email: 'custom-admin@example.com',
    })
    expect(admin.email).toBe('custom-admin@example.com')
    expect(admin.verified).toBe(true)
  })
  it('should create verified and unverified users', () => {
    const verifiedUser = UserFactory.createVerifiedUser()
    const unverifiedUser = UserFactory.createUnverifiedUser()
    expect(verifiedUser.verified).toBe(true)
    expect(unverifiedUser.verified).toBe(false)
  })
  it('should allow custom user data override', () => {
    const customUser = UserFactory.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@custom.com',
      password: 'CustomPassword123!',
      verified: true,
    })
    expect(customUser.firstName).toBe('John')
    expect(customUser.lastName).toBe('Doe')
    expect(customUser.email).toBe('john.doe@custom.com')
    expect(customUser.password).toBe('CustomPassword123!')
    expect(customUser.verified).toBe(true)
  })
})
