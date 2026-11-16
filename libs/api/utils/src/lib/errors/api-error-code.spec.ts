import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { ApolloServer } from '@apollo/server'
import {
  INestApplication,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Test } from '@nestjs/testing'
import type { GraphQLFormattedError } from 'graphql'
import { CtxOrganization, CtxOrganizationId } from '../decorators/ctx-organization.decorator'
import {
  API_ERROR_CODES,
  forbiddenWithCode,
  formatApiError,
  organizationContextRequired,
} from './api-error-code'

@Resolver()
class ProbeResolver {
  @Query(() => String)
  organizationId(@CtxOrganizationId() organizationId: string): string {
    return organizationId
  }

  @Query(() => String)
  organizationName(@CtxOrganization() organization: { organizationId: string }): string {
    return organization.organizationId
  }

  @Query(() => String)
  deadSession(): string {
    throw new UnauthorizedException('Session has been invalidated.')
  }

  @Query(() => String)
  claimsUnauthenticated(): string {
    throw forbiddenWithCode('UNAUTHENTICATED', 'A 403 may not mint a logout')
  }

  // An app's own code, not one of API_ERROR_CODES.
  @Query(() => String)
  appWorkflowRefusal(): string {
    throw forbiddenWithCode('WORKFLOW_STEP_LOCKED', 'This step is locked until the review is done')
  }

  // What JwtStrategy throws when an API token lookup fails (the database is down, say).
  @Query(() => String)
  lookupUnavailable(): string {
    throw new ServiceUnavailableException('API token validation is temporarily unavailable')
  }
}

/**
 * The real pipeline: `@nestjs/apollo`'s HTTP-exception mapping, then the API's `formatError`,
 * configured as `ApiCoreFeatureModule` configures it.
 */
describe('API error codes over GraphQL', () => {
  let app: INestApplication
  let server: ApolloServer

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          formatError: formatApiError,
        }),
      ],
      providers: [ProbeResolver],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    server = (app.get(GraphQLModule) as unknown as { graphQlAdapter: { instance: ApolloServer } })
      .graphQlAdapter.instance
  })

  afterAll(async () => {
    await app?.close()
  })

  const firstError = async (
    query: string,
    req: Record<string, unknown> = { user: { id: 'user-1' } },
  ): Promise<GraphQLFormattedError> => {
    const response = await server.executeOperation({ query }, { contextValue: { req } })
    if (response.body.kind !== 'single') throw new Error('expected a single result')
    const error = response.body.singleResult.errors?.[0]
    if (!error) throw new Error('expected an error')
    return error
  }

  it.each(['{ organizationId }', '{ organizationName }'])(
    'answers a signed-in request with no organization context (%s) with a 403 ORGANIZATION_CONTEXT_REQUIRED, not UNAUTHENTICATED',
    async query => {
      const error = await firstError(query)

      expect(error.extensions?.['code']).toBe('ORGANIZATION_CONTEXT_REQUIRED')
      expect(error.extensions?.['originalError']).toMatchObject({ statusCode: 403 })
      expect(error.message).toMatch(/organization context required/i)
    },
  )

  it('still answers a dead session with UNAUTHENTICATED', async () => {
    const error = await firstError('{ deadSession }')

    expect(error.extensions?.['code']).toBe('UNAUTHENTICATED')
  })

  it('never lets a 403 claim UNAUTHENTICATED', async () => {
    const error = await firstError('{ claimsUnauthenticated }')

    expect(error.extensions?.['code']).toBe('FORBIDDEN')
  })

  // formatApiError restores any upper-snake-case code a 403 was thrown with, not only the
  // template's: an app's own codes (workflow states, plan limits, ...) reach its clients as-is.
  it("keeps an app's own forbiddenWithCode code", async () => {
    const error = await firstError('{ appWorkflowRefusal }')

    expect(error.extensions?.['code']).toBe('WORKFLOW_STEP_LOCKED')
    expect(error.extensions?.['originalError']).toMatchObject({ statusCode: 403 })
    expect(error.message).toBe('This step is locked until the review is done')
  })

  // An internal failure keeps the session: Nest gives a 503 INTERNAL_SERVER_ERROR with its status,
  // and formatApiError leaves it so.
  it('answers an internal failure (503) without UNAUTHENTICATED', async () => {
    const error = await firstError('{ lookupUnavailable }')

    expect(error.extensions?.['code']).toBe('INTERNAL_SERVER_ERROR')
    expect(error.extensions?.['status']).toBe(503)
  })

  it.each(['{ organizationId }', '{ organizationName }'])(
    'answers a GraphQL context with no request (%s) with a 500, not UNAUTHENTICATED or the 403',
    async query => {
      const response = await server.executeOperation({ query }, { contextValue: {} })
      if (response.body.kind !== 'single') throw new Error('expected a single result')
      const error = response.body.singleResult.errors?.[0]

      expect(error?.extensions?.['code']).toBe('INTERNAL_SERVER_ERROR')
      expect(error?.extensions?.['status']).toBe(500)
    },
  )
})

describe('organizationContextRequired', () => {
  it('is an HTTP 403 whose body carries the code', () => {
    const error = organizationContextRequired()

    expect(error.getStatus()).toBe(403)
    expect(error.getResponse()).toMatchObject({
      statusCode: 403,
      code: API_ERROR_CODES.ORGANIZATION_CONTEXT_REQUIRED,
    })
    expect(error.message).toMatch(/organization context required/i)
  })
})

describe('formatApiError', () => {
  const formatted = (originalError: unknown, code = 'FORBIDDEN'): GraphQLFormattedError => ({
    message: 'm',
    extensions: { code, originalError },
  })

  it('leaves errors without a coded body alone', () => {
    const error = formatted({ statusCode: 403, message: 'No permission' })
    expect(formatApiError(error)).toBe(error)
    const plain: GraphQLFormattedError = { message: 'm' }
    expect(formatApiError(plain)).toBe(plain)
  })

  it('never sets a code on a 401', () => {
    const error = formatted({ statusCode: 401, code: 'SOMETHING_ELSE' }, 'UNAUTHENTICATED')
    expect(formatApiError(error).extensions?.['code']).toBe('UNAUTHENTICATED')
  })

  it('ignores a code that is not upper snake case', () => {
    const error = formatted({ statusCode: 403, code: 'not a code' })
    expect(formatApiError(error).extensions?.['code']).toBe('FORBIDDEN')
  })
})
