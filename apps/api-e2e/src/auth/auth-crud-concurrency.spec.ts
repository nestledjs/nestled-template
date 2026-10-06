import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import pg from 'pg'
import { TestHelpers, type TestUser } from '../support/test-helpers'
import { sql } from '../support/test-db'

const connectionString =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/nestled_template_test'
const primaryId = (user: TestUser) =>
  sql(`SELECT id FROM "Email" WHERE "userId" = :'userId' AND "primary";`, { userId: user.id })

describe('Concurrent administrative authentication maintenance', () => {
  let admin: TestUser
  beforeAll(async () => {
    admin = await TestHelpers.registerUser()
    sql(`UPDATE "User" SET "isSuperAdmin" = true WHERE id = :'userId';`, { userId: admin.id })
  })

  async function holdingOwner<T>(userId: string, run: (owner: pg.Client) => Promise<T>) {
    const owner = new pg.Client({ connectionString })
    await owner.connect()
    try {
      await owner.query('BEGIN')
      await owner.query(`SELECT id FROM "User" WHERE id = $1 FOR NO KEY UPDATE`, [userId])
      return await run(owner)
    } finally {
      await owner.query('ROLLBACK')
      await owner.end()
    }
  }

  it('rolls back immediately with a retryable conflict instead of waiting for an owner', async () => {
    const user = await TestHelpers.registerUser()
    const emailId = primaryId(user)
    const writer = new pg.Client({ connectionString })
    await writer.connect()
    try {
      await writer.query(`SET lock_timeout = '200ms'`)
      await holdingOwner(user.id, async () => {
        await expect(
          writer.query(`UPDATE "Email" SET verified = true WHERE id = $1`, [emailId]),
        ).rejects.toMatchObject({ code: '40001' })
      })
      expect(sql(`SELECT verified FROM "Email" WHERE id = :'emailId';`, { emailId })).toBe('f')
    } finally {
      await writer.end()
    }
  })

  it.each(['address', 'inverse relation'])(
    'retries a complete generated %s write while a User-first workflow completes',
    async operation => {
      const user = await TestHelpers.registerUser()
      const replacement = await TestHelpers.registerUser()
      const emailId = primaryId(user)
      const newEmail = `concurrent-${randomUUID()}@example.com`
      const response = await holdingOwner(user.id, async owner => {
        const writing =
          operation === 'address'
            ? TestHelpers.authenticatedGraphql(
                `mutation($id: String!, $input: UpdateEmailInput!) {
              updateEmail(emailId: $id, input: $input) { id }
            }`,
                admin,
                { id: emailId, input: { email: newEmail } },
              )
            : TestHelpers.authenticatedGraphql(
                `mutation($id: String!, $input: UpdateUserInput!) {
              updateUser(userId: $id, input: $input) { id }
            }`,
                admin,
                { id: replacement.id, input: { emailsIds: [primaryId(replacement), emailId] } },
              )
        // Let the admin write reach the locked owner, then exercise the opposite lock order.
        await delay(150)
        await owner.query(`UPDATE "Email" SET verified = true WHERE id = $1`, [emailId])
        await owner.query('COMMIT')
        return writing
      })
      expect(response.data.errors).toBeUndefined()
      expect(sql(`SELECT "emailValidated" FROM "User" WHERE id = :'id';`, { id: user.id })).toBe(
        'f',
      )
      expect(sql(`SELECT verified FROM "Email" WHERE id = :'emailId';`, { emailId })).toBe('f')
      expect(sql(`SELECT email, "userId" FROM "Email" WHERE id = :'emailId';`, { emailId })).toBe(
        operation === 'address' ? `${newEmail}|${user.id}` : `${user.email}|${replacement.id}`,
      )
    },
  )

  it('completes concurrent inverse owner moves without retaining verification', async () => {
    const users = await Promise.all([TestHelpers.registerUser(), TestHelpers.registerUser()])
    const emails = users.map(primaryId)
    for (const emailId of emails) {
      sql(`UPDATE "Email" SET verified = true WHERE id = :'emailId';`, { emailId })
    }
    const responses = await Promise.all(
      emails.map((id, index) =>
        TestHelpers.authenticatedGraphql(
          `mutation($id: String!, $input: UpdateEmailInput!) {
        updateEmail(emailId: $id, input: $input) { id }
      }`,
          admin,
          { id, input: { userId: users[1 - index].id } },
        ),
      ),
    )
    for (const response of responses) expect(response.data.errors).toBeUndefined()
    for (const [index, emailId] of emails.entries()) {
      expect(
        sql(
          `SELECT "userId" = :'ownerId' AND NOT verified AND NOT "primary"
        FROM "Email" WHERE id = :'emailId';`,
          { emailId, ownerId: users[1 - index].id },
        ),
      ).toBe('t')
      expect(
        sql(`SELECT "emailValidated" FROM "User" WHERE id = :'id';`, { id: users[index].id }),
      ).toBe('f')
    }
  })

  it('retries membership deletion while a User-first workflow holds the former owner', async () => {
    const user = await TestHelpers.registerUser()
    const membershipId = sql(
      `SELECT id FROM "OrganizationMember" WHERE "userId" = :'userId' LIMIT 1;`,
      {
        userId: user.id,
      },
    )
    sql(
      `UPDATE "User" SET "activeOrganizationId" = (
      SELECT "organizationId" FROM "OrganizationMember" WHERE id = :'membershipId'
    ) WHERE id = :'userId';`,
      { membershipId, userId: user.id },
    )
    const response = await holdingOwner(user.id, async owner => {
      const writing = TestHelpers.authenticatedGraphql(
        `mutation($id: String!) { deleteOrganizationMember(organizationMemberId: $id) { id } }`,
        admin,
        { id: membershipId },
      )
      await delay(150)
      await owner.query(`SELECT id FROM "OrganizationMember" WHERE id = $1 FOR UPDATE`, [
        membershipId,
      ])
      await owner.query('COMMIT')
      return writing
    })
    expect(response.data.errors).toBeUndefined()
    expect(
      sql(`SELECT "activeOrganizationId" IS NULL FROM "User" WHERE id = :'id';`, { id: user.id }),
    ).toBe('t')
  })
})
