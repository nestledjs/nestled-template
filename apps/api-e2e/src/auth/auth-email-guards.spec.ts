import { describe, it, expect } from 'vitest'
import * as speakeasy from 'speakeasy'
import { TestHelpers } from '../support/test-helpers'
import { UserFactory } from '../support/factories/user.factory'
import { sql } from '../support/test-db'

/**
 * Authentication hardening: staff email edits and rejected two-factor codes.
 */

describe('Authentication: staff email edits', () => {
  it('stores a changed address unverified and refuses to change a primary one', async () => {
    const admin = await TestHelpers.registerUser(UserFactory.create())
    sql(`UPDATE "User" SET "isSuperAdmin" = true WHERE id = :'userId';`, { userId: admin.id })
    const user = await TestHelpers.registerUser(UserFactory.create())
    const primaryId = sql(`SELECT id FROM "Email" WHERE "userId" = :'userId' AND "primary";`, {
      userId: user.id,
    })
    // A second, verified, non-primary address.
    const secondaryId = sql(
      `INSERT INTO "Email" (id, "createdAt", "updatedAt", email, verified, "primary", "userId")
       VALUES (gen_random_uuid(), NOW(), NOW(), :'email', true, false, :'userId') RETURNING id;`,
      { email: `secondary-${Date.now()}@example.com`, userId: user.id },
    ).split('\n')[0]

    const staffUpdate = (emailId: string, input: Record<string, unknown>) =>
      TestHelpers.authenticatedGraphql(
        `mutation StaffUpdateEmail($emailId: String!, $input: StaffUpdateEmailInput!) {
          staffUpdateEmail(emailId: $emailId, input: $input) { id email verified primary }
        }`,
        admin,
        { emailId, input },
      )

    const changed = await staffUpdate(secondaryId, {
      email: `changed-${Date.now()}@example.com`,
      verified: true,
    })
    expect(changed.data.errors).toBeUndefined()
    expect(changed.data.data.staffUpdateEmail.verified).toBe(false)

    const primaryChange = await staffUpdate(primaryId, { email: `other-${Date.now()}@example.com` })
    expect(primaryChange.data.errors?.[0]?.message).toMatch(/primary email cannot be changed/i)
    const unverifyPrimary = await staffUpdate(primaryId, { verified: false })
    expect(unverifyPrimary.data.errors?.[0]?.message).toMatch(/primary email cannot be changed/i)

    // Verifying the primary keeps the account's flag in step.
    const emailValidated = () =>
      sql(`SELECT "emailValidated" FROM "User" WHERE id = :'userId';`, { userId: user.id })
    expect(emailValidated()).toBe('f')
    const verifyPrimary = await staffUpdate(primaryId, { verified: true })
    expect(verifyPrimary.data.errors).toBeUndefined()
    expect(emailValidated()).toBe('t')
  })
})

describe('Authentication: rejected two-factor codes', () => {
  it('are recorded as a security event on the account, not an audit entry', async () => {
    const userData = UserFactory.create()
    const user = await TestHelpers.registerUser(userData)
    const setup = await TestHelpers.authenticatedGraphql(
      `mutation Setup2FA { setup2FA { secret } }`,
      user,
    )
    const secret: string = setup.data.data.setup2FA.secret
    const enable = await TestHelpers.authenticatedGraphql(
      `mutation Enable2FA($input: Verify2FAInput!) { enable2FA(input: $input) { success } }`,
      user,
      { input: { code: speakeasy.totp({ secret, encoding: 'base32' }) } },
    )
    expect(enable.data.errors).toBeUndefined()

    const login = await TestHelpers.graphql(
      `mutation Login($input: LoginInput!) { login(input: $input) { tempToken } }`,
      { input: { email: userData.email, password: userData.password } },
    )
    const tempToken: string = login.data.data.login.tempToken
    const valid = speakeasy.totp({ secret, encoding: 'base32' })
    const wrong = valid === '000000' ? '111111' : '000000'

    const complete = await TestHelpers.graphql(
      `mutation Complete2FA($tempToken: String!, $code: String!) {
        complete2FALogin(tempToken: $tempToken, code: $code) { token }
      }`,
      { tempToken, code: wrong },
    )
    expect(complete.data.errors?.[0]?.message).toMatch(/invalid 2fa code/i)

    // Security events are written off the request path; give the write a moment to land.
    const count = (statement: string) => Number(sql(statement, { userId: user.id }))
    let events = 0
    for (let attempt = 0; attempt < 20 && events === 0; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      events = count(
        `SELECT count(*) FROM "SecurityEvent" WHERE "userId" = :'userId' AND "eventType" = 'TWO_FACTOR_CODE_REJECTED';`,
      )
    }
    expect(events).toBe(1)
    expect(
      count(
        `SELECT count(*) FROM "AuditLog" WHERE "userId" = :'userId' AND action = 'TWO_FACTOR_CODE_REJECTED';`,
      ),
    ).toBe(0)
  })
})
