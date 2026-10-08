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

async function waitForWriteProgress(writing: Promise<unknown>, observed: () => Promise<boolean>) {
  let settled = false
  void writing.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (await observed()) return
    if (settled) throw new Error('The API request finished before the expected database contention')
    await delay(10)
  }
  throw new Error('The API request did not reach the expected database contention')
}

async function waitForAccountLock(owner: pg.Client, writing: Promise<unknown>) {
  return waitForWriteProgress(writing, async () => {
    const result = await owner.query<{ waiting: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))
      ) AS waiting
    `)
    return result.rows[0].waiting
  })
}

async function withWriteAttemptProbe<T>(
  table: 'Email' | 'OrganizationMember',
  event: 'UPDATE' | 'DELETE',
  id: string,
  run: (attempts: () => number) => Promise<T>,
): Promise<T> {
  // AFTER triggers run in name order. Count before the invariant trigger can roll back the write;
  // sequences are not transactional, so a second attempt proves the first failed and was retried.
  const probe = `000_auth_attempt_${randomUUID().replaceAll('-', '')}`
  try {
    sql(
      `CREATE SEQUENCE "${probe}";
       CREATE FUNCTION "${probe}"() RETURNS trigger AS $$
       BEGIN PERFORM nextval('"${probe}"'); RETURN NULL; END;
       $$ LANGUAGE plpgsql;
       CREATE TRIGGER "${probe}" AFTER ${event} ON "${table}"
       FOR EACH ROW WHEN (OLD.id = :'id') EXECUTE FUNCTION "${probe}"();`,
      { id },
    )
    return await run(() =>
      Number(sql(`SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM "${probe}";`)),
    )
  } finally {
    sql(`DROP TRIGGER IF EXISTS "${probe}" ON "${table}";
         DROP FUNCTION IF EXISTS "${probe}"();
         DROP SEQUENCE IF EXISTS "${probe}";`)
  }
}

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

  it.each(['userId', 'organizationId', 'roleId'] as const)(
    'refuses to remove a membership whose %s changes before the account lock',
    async changedField => {
      const actor = await TestHelpers.registerUser()
      const member = await TestHelpers.registerUser()
      const replacement = await TestHelpers.registerUser()
      const organizationId = sql(`SELECT "activeOrganizationId" FROM "User" WHERE id = :'id';`, {
        id: actor.id,
      })
      const targetOrganizationId = sql(
        `SELECT "activeOrganizationId" FROM "User" WHERE id = :'id';`,
        { id: replacement.id },
      )
      const roleId = sql(
        `SELECT id FROM "Role" WHERE "organizationId" = :'id' AND name = 'Member';`,
        { id: organizationId },
      )
      const ownerRoleId = sql(
        `SELECT id FROM "Role" WHERE "organizationId" = :'id' AND name = 'Owner';`,
        { id: organizationId },
      )
      const membershipId = randomUUID()
      sql(
        `INSERT INTO "OrganizationMember" (id, "createdAt", "updatedAt", "userId", "organizationId", "roleId")
         VALUES (:'id', NOW(), NOW(), :'userId', :'organizationId', :'roleId');`,
        { id: membershipId, userId: member.id, organizationId, roleId },
      )
      const response = await holdingOwner(member.id, async owner => {
        const writing = TestHelpers.authenticatedGraphql(
          `mutation($input: RemoveOrganizationMemberInput!) { removeOrganizationMember(input: $input) }`,
          actor,
          { input: { organizationId, userId: member.id } },
        )
        await waitForAccountLock(owner, writing)
        if (changedField === 'userId') {
          await owner.query(`UPDATE "OrganizationMember" SET "userId" = $1 WHERE id = $2`, [
            replacement.id,
            membershipId,
          ])
        } else if (changedField === 'organizationId') {
          await owner.query(
            `UPDATE "OrganizationMember" SET "organizationId" = $1, "roleId" = (SELECT id FROM "Role" WHERE "organizationId" = $1 AND name = 'Member') WHERE id = $2`,
            [targetOrganizationId, membershipId],
          )
        }
        if (changedField === 'roleId') {
          await owner.query(`UPDATE "OrganizationMember" SET "roleId" = $1 WHERE id = $2`, [
            ownerRoleId,
            membershipId,
          ])
        }
        await owner.query('COMMIT')
        return writing
      })
      expect(response.data.errors?.length).toBeGreaterThan(0)
      const expectedValue = {
        userId: replacement.id,
        organizationId: targetOrganizationId,
        roleId: ownerRoleId,
      }[changedField]
      expect(
        sql(`SELECT "${changedField}" FROM "OrganizationMember" WHERE id = :'id';`, {
          id: membershipId,
        }),
      ).toBe(expectedValue)
    },
  )

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
      const response = await withWriteAttemptProbe('Email', 'UPDATE', emailId, attempts =>
        holdingOwner(user.id, async owner => {
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
          // Observe a complete retry before exercising the opposite lock order.
          await waitForWriteProgress(writing, async () => attempts() >= 2)
          await owner.query(`UPDATE "Email" SET verified = true WHERE id = $1`, [emailId])
          await owner.query('COMMIT')
          return writing
        }),
      )
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
    const response = await withWriteAttemptProbe(
      'OrganizationMember',
      'DELETE',
      membershipId,
      attempts =>
        holdingOwner(user.id, async owner => {
          const writing = TestHelpers.authenticatedGraphql(
            `mutation($id: String!) { deleteOrganizationMember(organizationMemberId: $id) { id } }`,
            admin,
            { id: membershipId },
          )
          await waitForWriteProgress(writing, async () => attempts() >= 2)
          await owner.query(`SELECT id FROM "OrganizationMember" WHERE id = $1 FOR UPDATE`, [
            membershipId,
          ])
          await owner.query('COMMIT')
          return writing
        }),
    )
    expect(response.data.errors).toBeUndefined()
    expect(
      sql(`SELECT "activeOrganizationId" IS NULL FROM "User" WHERE id = :'id';`, { id: user.id }),
    ).toBe('t')
  })

  describe.each(['remove member', 'delete organization'])(
    '%s through the explicit API',
    operation => {
      it.each([true, false])(
        'waits for the account before taking membership locks (removed organization active: %s)',
        async active => {
          const actor = await TestHelpers.registerUser()
          const member = await TestHelpers.registerUser()
          const organizationId = sql(
            `SELECT "activeOrganizationId" FROM "User" WHERE id = :'id';`,
            { id: actor.id },
          )
          const originalOrganizationId = sql(
            `SELECT "activeOrganizationId" FROM "User" WHERE id = :'id';`,
            { id: member.id },
          )
          const roleId = sql(
            `SELECT id FROM "Role" WHERE "organizationId" = :'id' AND name = 'Member';`,
            { id: organizationId },
          )
          const added = await TestHelpers.authenticatedGraphql(
            `mutation($input: AddOrganizationMemberInput!) { addOrganizationMember(input: $input) }`,
            actor,
            { input: { organizationId, userId: member.id, roleId } },
          )
          expect(added.data.errors).toBeUndefined()
          const membershipId = sql(
            `SELECT id FROM "OrganizationMember" WHERE "userId" = :'userId' AND "organizationId" = :'organizationId';`,
            { userId: member.id, organizationId },
          )
          if (active) {
            sql(`UPDATE "User" SET "activeOrganizationId" = :'organizationId' WHERE id = :'id';`, {
              organizationId,
              id: member.id,
            })
          }
          const response = await holdingOwner(member.id, async owner => {
            const writing =
              operation === 'remove member'
                ? TestHelpers.authenticatedGraphql(
                    `mutation($input: RemoveOrganizationMemberInput!) { removeOrganizationMember(input: $input) }`,
                    actor,
                    { input: { organizationId, userId: member.id } },
                  )
                : TestHelpers.authenticatedGraphql(
                    `mutation($organizationId: String!) { userDeleteOrganization(organizationId: $organizationId) }`,
                    actor,
                    { organizationId },
                  )
            await waitForAccountLock(owner, writing)
            await owner.query(`SELECT id FROM "OrganizationMember" WHERE id = $1 FOR UPDATE`, [
              membershipId,
            ])
            await owner.query('COMMIT')
            return writing
          })
          expect(response.data.errors).toBeUndefined()
          expect(
            sql(`SELECT COUNT(*) FROM "OrganizationMember" WHERE id = :'id';`, {
              id: membershipId,
            }),
          ).toBe('0')
          expect(
            sql(`SELECT COALESCE("activeOrganizationId", '') FROM "User" WHERE id = :'id';`, {
              id: member.id,
            }),
          ).toBe(active ? '' : originalOrganizationId)
        },
      )
    },
  )

  it('retries organization deletion when a membership arrives after the owner snapshot', async () => {
    const actor = await TestHelpers.registerUser()
    const member = await TestHelpers.registerUser()
    const organizationId = sql(`SELECT "activeOrganizationId" FROM "User" WHERE id = :'id';`, {
      id: actor.id,
    })
    const roleId = sql(
      `SELECT id FROM "Role" WHERE "organizationId" = :'id' AND name = 'Member';`,
      { id: organizationId },
    )
    const response = await holdingOwner(actor.id, async actorOwner => {
      const writing = TestHelpers.authenticatedGraphql(
        `mutation($organizationId: String!) { userDeleteOrganization(organizationId: $organizationId) }`,
        actor,
        { organizationId },
      )
      // The owner's blocked SELECT has already taken its membership snapshot.
      await waitForAccountLock(actorOwner, writing)
      sql(
        `INSERT INTO "OrganizationMember" (id, "createdAt", "updatedAt", "userId", "organizationId", "roleId")
         VALUES (:'id', NOW(), NOW(), :'userId', :'organizationId', :'roleId');`,
        { id: randomUUID(), userId: member.id, organizationId, roleId },
      )
      return holdingOwner(member.id, async memberOwner => {
        await actorOwner.query('COMMIT')
        // The first attempt rolls back; its retry sees and waits for the new member's account.
        await waitForAccountLock(memberOwner, writing)
        await memberOwner.query('COMMIT')
        return writing
      })
    })
    expect(response.data.errors).toBeUndefined()
    expect(
      sql(`SELECT COUNT(*) FROM "Organization" WHERE id = :'id';`, { id: organizationId }),
    ).toBe('0')
    expect(
      sql(`SELECT COUNT(*) FROM "OrganizationMember" WHERE "organizationId" = :'id';`, {
        id: organizationId,
      }),
    ).toBe('0')
  })
})
