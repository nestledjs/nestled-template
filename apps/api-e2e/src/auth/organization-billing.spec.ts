import { describe, it, expect } from 'vitest'
import axios from 'axios'
import { TestHelpers, type TestUser } from '../support/test-helpers'
import { UserFactory } from '../support/factories/user.factory'
import { sql } from '../support/test-db'

/**
 * Authorization hardening: billing operations need billing permissions in a current membership.
 */

const gql = (user: TestUser, query: string, variables?: object, organizationId?: string) =>
  axios.post(
    '/graphql',
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.tokens?.accessToken}`,
        ...(organizationId ? { 'x-organization-id': organizationId } : {}),
      },
    },
  )

const CURRENT_SUBSCRIPTION = `query { currentSubscription { id } }`
const CANCEL_SUBSCRIPTION = `mutation { cancelSubscription { id } }`
const CURRENT_PLAN = `query { currentPlan { id } }`

const forbidden = (response: { data: { errors?: { message: string }[] } }) =>
  expect(response.data.errors?.[0]?.message).toMatch(/permission|organization context/i)

describe('Authorization: organization billing', () => {
  it('admits an Owner, refuses a Member, and refuses a removed member with a stale active organization', async () => {
    const owner = await TestHelpers.registerUser(UserFactory.create())
    const member = await TestHelpers.registerUser(UserFactory.create())
    const organizationId = sql(`SELECT "activeOrganizationId" FROM "User" WHERE id = :'id';`, {
      id: owner.id,
    })

    // The member joins the owner's organization with its seeded Member role, and makes it active.
    sql(
      `INSERT INTO "OrganizationMember" (id, "createdAt", "updatedAt", "userId", "organizationId", "roleId")
       SELECT gen_random_uuid(), NOW(), NOW(), :'userId', :'orgId', r.id
       FROM "Role" r WHERE r."organizationId" = :'orgId' AND r.name = 'Member';
       UPDATE "User" SET "activeOrganizationId" = :'orgId' WHERE id = :'userId';`,
      { userId: member.id, orgId: organizationId },
    )

    // Owner: billing reads and changes are authorized (no subscription exists, so the read is
    // null and cancel reports that, rather than a permission error).
    const ownerRead = await gql(owner, CURRENT_SUBSCRIPTION)
    expect(ownerRead.data.errors).toBeUndefined()
    const ownerCancel = await gql(owner, CANCEL_SUBSCRIPTION)
    expect(ownerCancel.data.errors?.[0]?.message).toMatch(/no active subscription/i)

    // Member: refused, whether the organization comes from the active field or the header.
    forbidden(await gql(member, CURRENT_SUBSCRIPTION))
    forbidden(await gql(member, CANCEL_SUBSCRIPTION, undefined, organizationId))
    // Any member may still read the plan.
    expect((await gql(member, CURRENT_PLAN)).data.errors).toBeUndefined()

    // Removal clears the member's active organization in the same transaction.
    const removed = await gql(
      owner,
      `mutation Remove($input: RemoveOrganizationMemberInput!) { removeOrganizationMember(input: $input) }`,
      { input: { organizationId, userId: member.id } },
    )
    expect(removed.data.errors).toBeUndefined()
    expect(
      sql(`SELECT coalesce("activeOrganizationId", 'null') FROM "User" WHERE id = :'id';`, {
        id: member.id,
      }),
    ).toBe('null')

    // Even if a stale value is put back, it grants nothing.
    sql(`UPDATE "User" SET "activeOrganizationId" = :'orgId' WHERE id = :'userId';`, {
      userId: member.id,
      orgId: organizationId,
    })
    forbidden(await gql(member, CURRENT_SUBSCRIPTION))
    forbidden(await gql(member, CANCEL_SUBSCRIPTION))
    const plan = await gql(member, CURRENT_PLAN)
    expect(plan.data.errors).toBeUndefined()
    expect(plan.data.data.currentPlan).toBeNull()
  })
})
