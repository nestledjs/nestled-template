import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import axios from 'axios'
import {
  buildClientSchema,
  buildSchema,
  getIntrospectionQuery,
  getNamedType,
  isLeafType,
  isNonNullType,
  type GraphQLSchema,
  type IntrospectionQuery,
} from 'graphql'
import {
  TestHelpers,
  type GraphQLErrorResponse,
  type GraphQLResponse,
  type TestUser,
} from '../support/test-helpers'
import { UserFactory } from '../support/factories/user.factory'
import { sql } from '../support/test-db'

/**
 * Clients log a user out on a 401 or `UNAUTHENTICATED`, so the API keeps those for a missing,
 * invalid or expired session. A signed-in request with no organization context is refused with a
 * 403 instead (`ORGANIZATION_CONTEXT_REQUIRED`, or the app's own access-denied code): the session
 * is fine.
 *
 * The spec names no operation of its own. It reads the API's schema and asks every query that
 * needs no arguments, so it runs unchanged in an app whose operations differ from the template's.
 */

type Headers = Record<string, string>

const post = (headers: Headers, query: string) =>
  axios.post<GraphQLResponse<unknown>>(
    '/graphql',
    { query },
    {
      headers: { 'Content-Type': 'application/json', ...headers },
      validateStatus: () => true,
    },
  )

const bearer = (user: TestUser): Headers => ({
  Authorization: `Bearer ${user.tokens?.accessToken}`,
})

/** The live schema, or the SDL the API wrote at startup when introspection is off. */
async function loadSchema(): Promise<GraphQLSchema> {
  const introspection = await post({}, getIntrospectionQuery())
  const data = introspection.data?.data as IntrospectionQuery | undefined
  if (data?.__schema) return buildClientSchema(data)

  const sdlPath = resolve(process.cwd(), 'api-schema.graphql')
  if (!existsSync(sdlPath)) {
    throw new Error(
      'Introspection is off and api-schema.graphql was not found at the workspace root: give the spec the schema another way.',
    )
  }
  return buildSchema(readFileSync(sdlPath, 'utf8'))
}

/** `{ field }` or `{ field { __typename } }` for every query whose arguments are all optional. */
function argumentFreeQueries(schema: GraphQLSchema): string[] {
  const fields = Object.values(schema.getQueryType()?.getFields() ?? {})
  return fields
    .filter(field =>
      field.args.every(arg => !isNonNullType(arg.type) || arg.defaultValue !== undefined),
    )
    .map(field =>
      isLeafType(getNamedType(field.type))
        ? `query { ${field.name} }`
        : `query { ${field.name} { __typename } }`,
    )
}

const isUnauthenticated = (error: GraphQLErrorResponse) =>
  error.extensions?.['code'] === 'UNAUTHENTICATED' ||
  (error.extensions?.['originalError'] as { statusCode?: unknown } | undefined)?.statusCode === 401

const statusCodeOf = (error: GraphQLErrorResponse) =>
  (error.extensions?.['originalError'] as { statusCode?: unknown } | undefined)?.statusCode

const BAD_BEARER: Headers = { Authorization: 'Bearer not-a-real-token' }

const errorsOf = async (headers: Headers, query: string) => {
  const response = await post(headers, query)
  return { status: response.status, errors: response.data.errors ?? [] }
}

describe('API auth error codes', () => {
  let queries: string[]
  // The queries a bad bearer is refused with UNAUTHENTICATED: the ones that need a session.
  let sessionQueries: string[]
  let badBearerRefusal: GraphQLErrorResponse | undefined

  beforeAll(async () => {
    queries = argumentFreeQueries(await loadSchema())
    expect(queries.length).toBeGreaterThan(0)

    sessionQueries = []
    for (const query of queries) {
      const refusal = (await errorsOf(BAD_BEARER, query)).errors.find(isUnauthenticated)
      if (refusal) {
        sessionQueries.push(query)
        badBearerRefusal ??= refusal
      }
    }
  })

  it('answers a bad bearer with UNAUTHENTICATED (a 401)', () => {
    expect(sessionQueries.length).toBeGreaterThan(0)
    expect(badBearerRefusal?.extensions?.['code']).toBe('UNAUTHENTICATED')
    expect(badBearerRefusal?.extensions?.['originalError']).toMatchObject({ statusCode: 401 })
  })

  it('never answers a signed-in request with no organization context with a 401', async () => {
    const owner = await TestHelpers.registerUser(UserFactory.create())
    const outsider = await TestHelpers.registerUser(UserFactory.create())
    const ownersOrganizationId = sql(
      `SELECT "organizationId" FROM "OrganizationMember" WHERE "userId" = :'id' LIMIT 1;`,
      { id: owner.id },
    )
    expect(ownersOrganizationId).not.toBe('')

    // The outsider is signed in, but asks for an organization it does not belong to. The header is
    // the explicit choice, so an API that repairs a stale saved organization cannot repair it away.
    const ownOrganization = bearer(outsider)
    const foreignOrganization = { ...ownOrganization, 'x-organization-id': ownersOrganizationId }

    const unauthenticated: string[] = []
    // Needs a session, answers the outsider in its own organization, and refuses it with a 403 in
    // the foreign one: an organization-context refusal, not an admin-only or public query.
    const refusedForTheOrganization: string[] = []
    for (const query of sessionQueries) {
      const foreign = await errorsOf(foreignOrganization, query)
      if (foreign.status === 401 || foreign.errors.some(isUnauthenticated)) {
        unauthenticated.push(query)
      }
      for (const error of foreign.errors) {
        if (error.extensions?.['code'] === 'ORGANIZATION_CONTEXT_REQUIRED') {
          expect(statusCodeOf(error), query).toBe(403)
        }
      }

      const refusedWith403 =
        foreign.errors.length > 0 && foreign.errors.every(error => statusCodeOf(error) === 403)
      if (refusedWith403 && (await errorsOf(ownOrganization, query)).errors.length === 0) {
        refusedForTheOrganization.push(query)
      }
    }

    // Nothing logs the outsider out, across every query that needs a session.
    expect(unauthenticated).toEqual([])
    // And the check measured an organization refusal: a query the outsider's session can run in
    // its own organization is refused with a 403 in one it does not belong to.
    expect(refusedForTheOrganization.length).toBeGreaterThan(0)
  })
})
