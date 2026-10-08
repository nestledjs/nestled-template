import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { TestHelpers, type TestUser } from '../support/test-helpers'
import { sql } from '../support/test-db'

const primaryId = (user: TestUser) =>
  sql(`SELECT id FROM "Email" WHERE "userId" = :'userId' AND "primary";`, { userId: user.id })
const validated = (user: TestUser) =>
  sql(`SELECT "emailValidated" FROM "User" WHERE id = :'userId';`, { userId: user.id })

describe('Administrative authentication records', () => {
  let admin: TestUser
  beforeAll(async () => {
    admin = await TestHelpers.registerUser()
    sql(`UPDATE "User" SET "isSuperAdmin" = true WHERE id = :'userId';`, { userId: admin.id })
  })

  it('keeps explicit session viewing available to the owner and permitted administrators', async () => {
    const user = await TestHelpers.registerUser()
    const own = await TestHelpers.authenticatedGraphql(`query { getUserSessions { id } }`, user)
    expect(own.data.errors).toBeUndefined()
    expect(own.data.data.getUserSessions.length).toBeGreaterThan(0)
    const query = `query($userId: String!) {
      adminUserDetails(userId: $userId) { id activeSessions { id isValid lastActiveAt } }
    }`
    const allowed = await TestHelpers.authenticatedGraphql(query, admin, { userId: user.id })
    expect(allowed.data.errors).toBeUndefined()
    expect(allowed.data.data.adminUserDetails.activeSessions.length).toBeGreaterThan(0)
    const denied = await TestHelpers.authenticatedGraphql(query, user, { userId: admin.id })
    expect(denied.data.errors?.length).toBeGreaterThan(0)
  })

  it('creates ordinary email records with unverified, non-primary defaults', async () => {
    const user = await TestHelpers.registerUser()
    const response = await TestHelpers.authenticatedGraphql(
      `mutation($input: CreateEmailInput!) {
      createEmail(input: $input) { id email verified primary }
    }`,
      admin,
      { input: { email: `new-${randomUUID()}@example.com`, userId: user.id } },
    )
    expect(response.data.errors).toBeUndefined()
    expect(response.data.data.createEmail).toMatchObject({ verified: false, primary: false })
  })

  it('keeps account and email flags readable but removes them from both write inputs', async () => {
    const response = await TestHelpers.authenticatedGraphql(
      `query {
      createEmail: __type(name: "CreateEmailInput") { inputFields { name } }
      updateEmail: __type(name: "UpdateEmailInput") { inputFields { name } }
      createUser: __type(name: "CreateUserInput") { inputFields { name } }
      updateUser: __type(name: "UpdateUserInput") { inputFields { name } }
      email: __type(name: "Email") { fields { name } }
      user: __type(name: "User") { fields { name } }
      mutation: __type(name: "Mutation") { fields { name } }
    }`,
      admin,
    )
    expect(response.data.errors).toBeUndefined()
    const data = response.data.data
    for (const operation of ['createEmail', 'updateEmail']) {
      const names = data[operation].inputFields.map((field: { name: string }) => field.name)
      expect(names).not.toEqual(expect.arrayContaining(['verified']))
      expect(names).not.toEqual(expect.arrayContaining(['primary']))
      expect(names).not.toContain('verifyExpires')
      expect(names).toContain('email')
    }
    for (const operation of ['createUser', 'updateUser']) {
      const names = data[operation].inputFields.map((field: { name: string }) => field.name)
      expect(names).not.toContain('emailValidated')
      expect(names).not.toContain('isSuperAdmin')
      expect(names).not.toContain('twoFactorEnabled')
      expect(names).not.toContain('twoFactorMethod')
      expect(names).not.toContain('twoFactorSecret')
      expect(names).not.toContain('twoFactorRecoveryCodes')
      expect(names).not.toContain('activeSessionsIds')
    }
    expect(data.email.fields.map((field: { name: string }) => field.name)).toEqual(
      expect.arrayContaining(['verified', 'primary']),
    )
    expect(data.user.fields.map((field: { name: string }) => field.name)).toEqual(
      expect.arrayContaining(['emailValidated', 'isSuperAdmin']),
    )
    const userFields = data.user.fields.map((field: { name: string }) => field.name)
    expect(userFields).not.toContain('twoFactorSecret')
    expect(userFields).not.toContain('twoFactorRecoveryCodes')
    const mutations = data.mutation.fields.map((field: { name: string }) => field.name)
    for (const operation of ['createUserSession', 'updateUserSession', 'deleteUserSession']) {
      expect(mutations).not.toContain(operation)
    }
    expect(mutations).toContain('invalidateSession')
  })

  it('resets verification and account state when generic CRUD changes an address', async () => {
    const user = await TestHelpers.registerUser()
    const emailId = primaryId(user)
    sql(`UPDATE "Email" SET verified = true, "verifyToken" = 'old-token' WHERE id = :'emailId';`, {
      emailId,
    })
    sql(`UPDATE "User" SET "validateEmailToken" = 'account-' || id WHERE id = :'userId';`, {
      userId: user.id,
    })
    expect(validated(user)).toBe('t')
    const response = await TestHelpers.authenticatedGraphql(
      `mutation($id: String!, $input: UpdateEmailInput!) {
      updateEmail(emailId: $id, input: $input) { id email verified primary }
    }`,
      admin,
      { id: emailId, input: { email: `changed-${randomUUID()}@example.com` } },
    )
    expect(response.data.errors).toBeUndefined()
    expect(response.data.data.updateEmail.verified).toBe(false)
    expect(validated(user)).toBe('f')
    expect(
      sql(`SELECT "verifyToken" IS NULL FROM "Email" WHERE id = :'emailId';`, { emailId }),
    ).toBe('t')
    expect(
      sql(`SELECT "validateEmailToken" IS NULL FROM "User" WHERE id = :'userId';`, {
        userId: user.id,
      }),
    ).toBe('t')
  })

  it('clears verification and primary status when an inverse relation moves an address', async () => {
    const oldOwner = await TestHelpers.registerUser()
    const newOwner = await TestHelpers.registerUser()
    const emailId = primaryId(oldOwner)
    sql(`UPDATE "Email" SET verified = true WHERE id = :'emailId';`, { emailId })
    const response = await TestHelpers.authenticatedGraphql(
      `mutation($id: String!, $input: UpdateUserInput!) {
      updateUser(userId: $id, input: $input) { id }
    }`,
      admin,
      { id: newOwner.id, input: { emailsIds: [primaryId(newOwner), emailId] } },
    )
    expect(response.data.errors).toBeUndefined()
    expect(
      sql(
        `SELECT "userId" = :'userId' AND NOT verified AND NOT "primary" FROM "Email" WHERE id = :'emailId';`,
        { userId: newOwner.id, emailId },
      ),
    ).toBe('t')
    expect(validated(oldOwner)).toBe('f')
    expect(validated(newOwner)).toBe('f')
  })

  it('recomputes the account flag after generic primary-email deletion', async () => {
    const user = await TestHelpers.registerUser()
    const emailId = primaryId(user)
    sql(`UPDATE "Email" SET verified = true WHERE id = :'emailId';`, { emailId })
    const response = await TestHelpers.authenticatedGraphql(
      `mutation($id: String!) {
      deleteEmail(emailId: $id) { id }
    }`,
      admin,
      { id: emailId },
    )
    expect(response.data.errors).toBeUndefined()
    expect(validated(user)).toBe('f')
  })

  it('preserves a freshly issued change-email token and allows its redemption', async () => {
    const user = await TestHelpers.registerUser()
    const response = await TestHelpers.authenticatedGraphql(
      `mutation($input: ChangeEmailInput!) {
      changeEmail(input: $input)
    }`,
      user,
      { input: { newEmail: `fresh-${randomUUID()}@example.com` } },
    )
    expect(response.data.errors).toBeUndefined()
    const token = sql(
      `SELECT "verifyToken" FROM "Email" WHERE "userId" = :'userId' AND "primary";`,
      { userId: user.id },
    )
    expect(token).not.toBe('')
    const verified = await TestHelpers.graphql(
      `mutation($token: String!) {
      verifyEmailChange(token: $token) { id emailValidated }
    }`,
      { token },
    )
    expect(verified.data.errors).toBeUndefined()
    expect(validated(user)).toBe('t')
  })

  it.each(['delete', 'move'])(
    'clears obsolete active context after membership %s',
    async operation => {
      const user = await TestHelpers.registerUser()
      const replacement = await TestHelpers.registerUser()
      const membershipId = sql(
        `SELECT id FROM "OrganizationMember" WHERE "userId" = :'userId' LIMIT 1;`,
        { userId: user.id },
      )
      sql(
        `UPDATE "User" SET "activeOrganizationId" = (SELECT "organizationId" FROM "OrganizationMember" WHERE id = :'membershipId') WHERE id = :'userId';`,
        { membershipId, userId: user.id },
      )
      const response =
        operation === 'delete'
          ? await TestHelpers.authenticatedGraphql(
              `mutation($id: String!) {
          deleteOrganizationMember(organizationMemberId: $id) { id }
        }`,
              admin,
              { id: membershipId },
            )
          : await TestHelpers.authenticatedGraphql(
              `mutation($id: String!, $input: UpdateOrganizationMemberInput!) {
          updateOrganizationMember(organizationMemberId: $id, input: $input) { id }
        }`,
              admin,
              { id: membershipId, input: { userId: replacement.id } },
            )
      expect(response.data.errors).toBeUndefined()
      expect(
        sql(`SELECT "activeOrganizationId" IS NULL FROM "User" WHERE id = :'userId';`, {
          userId: user.id,
        }),
      ).toBe('t')
    },
  )
})
