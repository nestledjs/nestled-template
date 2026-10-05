import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as speakeasy from 'speakeasy'
import { TestHelpers, type TestUser } from '../support/test-helpers'
import { UserFactory } from '../support/factories/user.factory'

/**
 * A password reset retires every credential issued before it: session tokens, API tokens and
 * pending 2FA temp tokens alike.
 */

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/nestled_template_test'

/**
 * Run one statement against the test database and return its unaligned, tuples-only output.
 * Values are passed as psql variables.
 */
function sql(statement: string, variables: Record<string, string>): string {
  const url = new URL(testDatabaseUrl)
  const args = [
    '-U',
    url.username || 'postgres',
    '-h',
    url.hostname || 'localhost',
    '-p',
    url.port || '5432',
    '-d',
    url.pathname.slice(1).split('?')[0],
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
  ]
  for (const [name, value] of Object.entries(variables)) {
    args.push('-v', `${name}=${value}`)
  }
  return execFileSync('psql', args, {
    input: statement,
    env: { ...process.env, PGPASSWORD: url.password || 'postgres' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
    .toString()
    .trim()
}

/** Stand in for the emailed link: put a known reset token on the account. */
function issueResetToken(userId: string): string {
  const token = randomBytes(32).toString('hex')
  sql(
    `UPDATE "User" SET "passwordResetToken" = :'token', "passwordResetExpires" = NOW() + INTERVAL '1 hour' WHERE id = :'userId';`,
    { token, userId },
  )
  return token
}

async function resetPassword(token: string, password: string) {
  const response = await TestHelpers.graphql(
    `mutation ResetPassword($input: ResetPasswordInput!) { resetPassword(input: $input) { id } }`,
    { input: { token, password } },
  )
  expect(response.data.errors).toBeUndefined()
}

async function me(user: TestUser) {
  return TestHelpers.authenticatedGraphql(`query Me { me { id } }`, user)
}

describe('Authentication: password reset retires earlier credentials', () => {
  it('refuses a session token issued before the reset', async () => {
    const userData = UserFactory.create()
    const user = await TestHelpers.registerUser(userData)

    const before = await me(user)
    expect(before.data.errors).toBeUndefined()
    expect(before.data.data.me.id).toBe(user.id)

    await resetPassword(issueResetToken(user.id), 'ResetPassword123!')

    const after = await me(user)
    expect(after.data.errors?.[0]?.message).toMatch(/unauthorized|invalidated/i)
    expect(after.data.data?.me ?? null).toBeNull()

    // The new password works and yields a usable token.
    const relogged = await TestHelpers.loginUser(userData.email, 'ResetPassword123!')
    const fresh = await me(relogged)
    expect(fresh.data.errors).toBeUndefined()
    expect(fresh.data.data.me.id).toBe(user.id)
  })

  it('refuses an API token issued before the reset', async () => {
    const user = await TestHelpers.registerUser(UserFactory.create())

    const generated = await TestHelpers.authenticatedGraphql(
      `mutation GenerateApiToken($input: GenerateApiTokenInput!) {
        generateApiToken(input: $input) { token }
      }`,
      user,
      { input: { name: 'e2e' } },
    )
    expect(generated.data.errors).toBeUndefined()
    const apiTokenUser: TestUser = {
      ...user,
      tokens: { accessToken: generated.data.data.generateApiToken.token },
    }

    const before = await me(apiTokenUser)
    expect(before.data.errors).toBeUndefined()
    expect(before.data.data.me.id).toBe(user.id)

    await resetPassword(issueResetToken(user.id), 'ResetPassword123!')

    const after = await me(apiTokenUser)
    expect(after.data.errors?.[0]?.message).toMatch(/unauthorized|invalid|expired/i)
    expect(after.data.data?.me ?? null).toBeNull()
  })

  it('refuses a pending 2FA temp token issued before the reset', async () => {
    const userData = UserFactory.create()
    const user = await TestHelpers.registerUser(userData)

    const setup = await TestHelpers.authenticatedGraphql(
      `mutation Setup2FA { setup2FA { secret } }`,
      user,
    )
    expect(setup.data.errors).toBeUndefined()
    const secret: string = setup.data.data.setup2FA.secret
    const code = () => speakeasy.totp({ secret, encoding: 'base32' })

    const enable = await TestHelpers.authenticatedGraphql(
      `mutation Enable2FA($input: Verify2FAInput!) { enable2FA(input: $input) { success } }`,
      user,
      { input: { code: code() } },
    )
    expect(enable.data.errors).toBeUndefined()

    const login = await TestHelpers.graphql(
      `mutation Login($input: LoginInput!) { login(input: $input) { requires2FA tempToken token } }`,
      { input: { email: userData.email, password: userData.password } },
    )
    expect(login.data.errors).toBeUndefined()
    expect(login.data.data.login.requires2FA).toBe(true)
    const tempToken: string = login.data.data.login.tempToken

    await resetPassword(issueResetToken(user.id), 'ResetPassword123!')

    const complete = await TestHelpers.graphql(
      `mutation Complete2FA($tempToken: String!, $code: String!) {
        complete2FALogin(tempToken: $tempToken, code: $code) { token }
      }`,
      { tempToken, code: code() },
    )
    expect(complete.data.errors?.[0]?.message).toMatch(/invalid or expired 2fa token/i)
    expect(complete.data.data?.complete2FALogin ?? null).toBeNull()
  })
})

describe('Authentication: a change of isActive retires earlier credentials', () => {
  it('through generated CRUD, so reactivating does not restore old tokens', async () => {
    const admin = await TestHelpers.registerUser(UserFactory.create())
    sql(`UPDATE "User" SET "isSuperAdmin" = true WHERE id = :'userId';`, { userId: admin.id })
    const userData = UserFactory.create()
    const user = await TestHelpers.registerUser(userData)
    const generationOf = () =>
      Number(sql(`SELECT "authGeneration" FROM "User" WHERE id = :'userId';`, { userId: user.id }))
    const before = generationOf()

    const setActive = async (isActive: boolean) => {
      const response = await TestHelpers.authenticatedGraphql(
        `mutation UpdateUser($userId: String!, $input: UpdateUserInput!) {
          updateUser(userId: $userId, input: $input) { id isActive }
        }`,
        admin,
        { userId: user.id, input: { isActive } },
      )
      expect(response.data.errors).toBeUndefined()
      expect(response.data.data.updateUser.isActive).toBe(isActive)
    }

    await setActive(false)
    expect(generationOf()).toBe(before + 1)
    await setActive(true)
    expect(generationOf()).toBe(before + 2)

    const after = await me(user)
    expect(after.data.errors?.[0]?.message).toMatch(/unauthorized|invalidated/i)
    expect(after.data.data?.me ?? null).toBeNull()

    // The reactivated account signs in again normally.
    const relogged = await TestHelpers.loginUser(userData.email, userData.password)
    const fresh = await me(relogged)
    expect(fresh.data.errors).toBeUndefined()
    expect(fresh.data.data.me.id).toBe(user.id)
  })
})

describe('Authentication: a revoked session stays revoked', () => {
  it('generated CRUD can revoke a session but not revive or extend it', async () => {
    const admin = await TestHelpers.registerUser(UserFactory.create())
    sql(`UPDATE "User" SET "isSuperAdmin" = true WHERE id = :'userId';`, { userId: admin.id })
    const user = await TestHelpers.registerUser(UserFactory.create())
    const sessionId = sql(
      `SELECT id FROM "UserSession" WHERE "userId" = :'userId' ORDER BY "createdAt" DESC LIMIT 1;`,
      { userId: user.id },
    )
    const updateSession = (input: Record<string, unknown>) =>
      TestHelpers.authenticatedGraphql(
        `mutation UpdateUserSession($userSessionId: String!, $input: UpdateUserSessionInput!) {
          updateUserSession(userSessionId: $userSessionId, input: $input) { id isValid expiresAt }
        }`,
        admin,
        { userSessionId: sessionId, input },
      )
    const sessionState = () =>
      sql(`SELECT "isValid" FROM "UserSession" WHERE id = :'sessionId';`, { sessionId })

    // Extending a live session's expiry is refused.
    const extended = await updateSession({
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    })
    expect(extended.data.errors?.length).toBeGreaterThan(0)

    // Revoking is allowed.
    const revoked = await updateSession({ isValid: false })
    expect(revoked.data.errors).toBeUndefined()
    expect(sessionState()).toBe('f')

    // Reviving is refused, and the token stays refused.
    const revived = await updateSession({ isValid: true })
    expect(revived.data.errors?.length).toBeGreaterThan(0)
    expect(sessionState()).toBe('f')
    const after = await me(user)
    expect(after.data.errors?.[0]?.message).toMatch(/unauthorized|invalidated/i)
  })
})
