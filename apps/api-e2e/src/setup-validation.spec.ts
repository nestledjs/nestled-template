import { describe, it, expect } from 'vitest'
import axios from 'axios'
import { TestHelpers } from './support/test-helpers'
import { UserFactory } from './support/factories/user.factory'
describe('E2E Test Setup Validation', () => {
  it('should have proper test environment setup', async () => {
    expect(process.env.NODE_ENV).toBe('test')
    expect(axios.defaults.baseURL).toBeDefined()
  })
  it('should be able to create test data', async () => {
    const userData = UserFactory.create()
    expect(userData.firstName).toBeDefined()
    expect(userData.lastName).toBeDefined()
    expect(userData.email).toContain('@')
    expect(userData.password).toBeDefined()
    expect(typeof userData.verified).toBe('boolean')
  })
  it('should be able to make GraphQL requests', async () => {
    const response = await TestHelpers.graphql(`
      query {
        uptime
      }
    `)
    expect(response.status).toBe(200)
    expect(response.data).toBeDefined()
  })
  it('should handle GraphQL errors properly', async () => {
    await expect(
      TestHelpers.graphql(`
      query {
        nonExistentField
      }
    `),
    ).rejects.toThrow()
  })
  it('should generate unique test emails', async () => {
    const email1 = TestHelpers.generateTestEmail()
    const email2 = TestHelpers.generateTestEmail()
    expect(email1).not.toBe(email2)
    expect(email1).toContain('@example.com')
    expect(email2).toContain('@example.com')
  })
  it('should create multiple unique users', async () => {
    const users = UserFactory.createMany(3)
    expect(users).toHaveLength(3)
    const emails = users.map(u => u.email)
    const uniqueEmails = [...new Set(emails)]
    expect(uniqueEmails).toHaveLength(3) // All emails should be unique
  })
})
