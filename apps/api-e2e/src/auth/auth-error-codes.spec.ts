import { describe, it, expect } from 'vitest'
import axios from 'axios'
import { TestHelpers, type GraphQLResponse, type TestUser } from '../support/test-helpers'
import { UserFactory } from '../support/factories/user.factory'
import { sql } from '../support/test-db'

/**
 * Clients log a user out on a 401 or `UNAUTHENTICATED`, so the API keeps those for a missing,
 * invalid or expired session. A signed-in request with no organization context is a 403
 * `ORGANIZATION_CONTEXT_REQUIRED` instead: the session is fine.
 */

const CURRENT_SUBSCRIPTION_ACTIVE = `query { currentSubscriptionActive }`

const post = (authorization: string | undefined, query: string) =>
  axios.post<GraphQLResponse<unknown>>(
    '/graphql',
    { query },
    {
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      validateStatus: () => true,
    },
  )

const bearer = (user: TestUser) => `Bearer ${user.tokens?.accessToken}`

describe('API auth error codes', () => {
  it('answers a bad bearer with UNAUTHENTICATED (a 401)', async () => {
    const response = await post('Bearer not-a-real-token', CURRENT_SUBSCRIPTION_ACTIVE)
    const error = response.data.errors?.[0]

    expect(error?.extensions?.['code']).toBe('UNAUTHENTICATED')
    expect(error?.extensions?.['originalError']).toMatchObject({ statusCode: 401 })
  })

  it('answers a signed-in request with no organization context with a 403 ORGANIZATION_CONTEXT_REQUIRED', async () => {
    const owner = await TestHelpers.registerUser(UserFactory.create())
    const outsider = await TestHelpers.registerUser(UserFactory.create())
    const ownersOrganizationId = sql(
      `SELECT "activeOrganizationId" FROM "User" WHERE id = :'id';`,
      {
        id: owner.id,
      },
    )

    // The outsider is signed in, but its active organization is one it does not belong to.
    sql(`UPDATE "User" SET "activeOrganizationId" = :'orgId' WHERE id = :'userId';`, {
      userId: outsider.id,
      orgId: ownersOrganizationId,
    })

    const response = await post(bearer(outsider), CURRENT_SUBSCRIPTION_ACTIVE)
    const error = response.data.errors?.[0]

    expect(error?.extensions?.['code']).toBe('ORGANIZATION_CONTEXT_REQUIRED')
    expect(error?.extensions?.['originalError']).toMatchObject({ statusCode: 403 })

    // The session itself is still good.
    const me = await post(bearer(outsider), `query { me { id } }`)
    expect(me.data.errors).toBeUndefined()
  })
})
