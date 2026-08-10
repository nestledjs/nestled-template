import { describe, expect, it } from 'vitest'
import {
  declaresAuthLevel,
  getAuthOperations,
  getGuardRank,
  getOperationGuardNames,
  hasAuthenticationGuard,
} from './doctor-auth-analysis'

describe('getAuthOperations', () => {
  it('attributes class-level access declarations and guards to every REST route', () => {
    const operations = getAuthOperations(`
      @Authenticated()
      @UseGuards(
        GqlAuthGuard,
        GqlThrottlerGuard,
      )
      @Controller('reports')
      export class ReportsController {
        @Get()
        list() {}

        @Post(':id')
        @AdminOnly()
        @UseGuards(GqlAuthAdminGuard)
        update() {}

        helper() {}
      }
    `)

    expect(operations).toHaveLength(2)
    expect(operations[0]).toMatchObject({
      className: 'ReportsController',
      kind: 'http',
      name: 'list',
    })
    expect(operations[0].classDecorators).toContain('@Authenticated()')
    expect(operations[0].classDecorators).toContain('GqlAuthGuard')
    expect(operations[1].decorators).toContain('@AdminOnly()')
    expect(operations[1].decorators).toContain('GqlAuthAdminGuard')
    expect(operations.every(declaresAuthLevel)).toBe(true)
    expect(operations.every(hasAuthenticationGuard)).toBe(true)
    expect(getOperationGuardNames(operations[1])).toEqual([
      'GqlAuthAdminGuard',
      'GqlAuthGuard',
      'GqlThrottlerGuard',
    ])
  })

  it('keeps access metadata isolated when a file contains multiple classes', () => {
    const operations = getAuthOperations(`
      @Public()
      @Controller('public')
      class PublicController {
        @Get()
        publicRoute() {}
      }

      @Controller('private')
      class PrivateController {
        @Delete(':id')
        privateRoute() {}
      }
    `)

    expect(operations.map(operation => operation.name)).toEqual(['publicRoute', 'privateRoute'])
    expect(operations[0].classDecorators).toContain('@Public()')
    expect(operations[1].classDecorators).not.toContain('@Public()')
    expect(declaresAuthLevel(operations[0])).toBe(true)
    expect(declaresAuthLevel(operations[1])).toBe(false)
    expect(hasAuthenticationGuard(operations[1])).toBe(false)
  })

  it('recognizes GraphQL and every supported Nest HTTP method decorator', () => {
    const operations = getAuthOperations(`
      @Resolver(() => User)
      class UserResolver {
        @Query(() => User)
        user() {}
      }

      @Controller('health')
      class HealthController {
        @Options()
        options() {}

        @Head()
        head() {}

        @Sse('events')
        events() {}
      }
    `)

    expect(operations.map(operation => [operation.kind, operation.name])).toEqual([
      ['graphql', 'user'],
      ['http', 'options'],
      ['http', 'head'],
      ['http', 'events'],
    ])
  })

  it('does not count a throttler as authentication', () => {
    const [operation] = getAuthOperations(`
      @Controller('login')
      class LoginController {
        @Public()
        @UseGuards(GqlThrottlerGuard)
        @Post()
        login() {}
      }
    `)

    expect(declaresAuthLevel(operation)).toBe(true)
    expect(getOperationGuardNames(operation)).toEqual(['GqlThrottlerGuard'])
    expect(hasAuthenticationGuard(operation)).toBe(false)
    expect(getGuardRank(['GqlAuthGuard'])).toBe(1)
    expect(getGuardRank(['GqlAuthGuard', 'GqlThrottlerGuard'])).toBe(1)
    expect(getGuardRank(['GqlThrottlerGuard'])).toBe(0)
  })

  it('parses nested guard calls and property-access decorators through the AST', () => {
    const [operation] = getAuthOperations(`
      @auth.Authenticated()
      @nest.UseGuards(AuthGuard('jwt'), guards.RolesGuard)
      @nest.Controller('reports')
      class ReportsController {
        @nest.Get()
        list() {}
      }
    `)

    expect(declaresAuthLevel(operation)).toBe(true)
    expect(getOperationGuardNames(operation)).toEqual(['AuthGuard', 'RolesGuard'])
    expect(hasAuthenticationGuard(operation)).toBe(true)
  })

  it('understands that scoped policy decorators compose authentication and enforcement', () => {
    const operations = getAuthOperations(`
      @Resolver()
      class AccessResolver {
        @Query(() => [String])
        @RequirePlatformPermission('platform.users.read')
        platformUsers() {}

        @Mutation(() => Boolean)
        @RequireOrganizationPermission(['member:update'], {
          organizationIdPath: 'input.organizationId',
        })
        updateMember() {}
      }
    `)

    expect(operations.every(declaresAuthLevel)).toBe(true)
    expect(operations.every(hasAuthenticationGuard)).toBe(true)
    expect(getOperationGuardNames(operations[0])).toEqual(['AccessPolicyGuard', 'GqlAuthGuard'])
    expect(getGuardRank(getOperationGuardNames(operations[0]))).toBe(3)
  })
})
