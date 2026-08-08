import { describe, expect, it } from 'vitest'
import {
  getCrudAuthAnnotationLines,
  getCustomResolverNameViolations,
  getGeneratedCrudImportViolations,
  getGraphqlRootFieldNames,
  getLegacyCoreHelpersImportViolations,
  getNonAdminOperationViolations,
  getPublicSdkGeneratedCrudViolations,
  isHandwrittenApiFile,
  supportsAdminOnlyGeneratorBoundary,
} from './doctor-crud-boundary-analysis'

describe('generated CRUD boundary analysis', () => {
  it('requires the strict-compatible Generator 3 admin-only contract', () => {
    expect(supportsAdminOnlyGeneratorBoundary('2.0.0')).toBe(false)
    expect(supportsAdminOnlyGeneratorBoundary('3.0.0')).toBe(false)
    expect(supportsAdminOnlyGeneratorBoundary('3.0.1')).toBe(false)
    expect(supportsAdminOnlyGeneratorBoundary('3.0.2')).toBe(false)
    expect(supportsAdminOnlyGeneratorBoundary('3.0.3')).toBe(true)
    expect(supportsAdminOnlyGeneratorBoundary('3.1.0')).toBe(true)
    expect(supportsAdminOnlyGeneratorBoundary('4.1.0-beta.1')).toBe(true)
    expect(supportsAdminOnlyGeneratorBoundary('workspace:*')).toBe(false)
  })

  it('rejects generated CRUD imports from application API code', () => {
    const violations = getGeneratedCrudImportViolations(`
      import type { ListUserInput } from '@example/api/generated-crud/data-access'
      const service = require('@example/api/generated-crud/feature')
    `)

    expect(violations).toHaveLength(2)
    expect(violations[0].message).toContain('explicit input and Prisma query')
    expect(violations[0].message).toContain('no admin-only exception')
  })

  it('does not reject the normal explicit Prisma data-access wrapper', () => {
    expect(
      getGeneratedCrudImportViolations(`
        import { ApiCoreDataAccessService } from '@example/api/core/data-access'
      `),
    ).toEqual([])
  })

  it('classifies handwritten API files with POSIX and Windows separators', () => {
    expect(isHandwrittenApiFile('libs/api/custom/src/lib/user.resolver.ts')).toBe(true)
    expect(isHandwrittenApiFile('libs\\api\\custom\\src\\lib\\user.resolver.ts')).toBe(true)
    expect(isHandwrittenApiFile('apps\\api\\src\\app.module.ts')).toBe(false)
    expect(
      isHandwrittenApiFile('libs\\api\\generated-crud\\feature\\src\\lib\\user.resolver.ts'),
    ).toBe(false)
    expect(isHandwrittenApiFile('libs\\api\\custom\\src\\lib\\user.resolver.spec.ts')).toBe(false)
  })

  it('rejects every form of import from the removed core-helper library', () => {
    expect(
      getLegacyCoreHelpersImportViolations(`
        import { createSelect } from '@example/api/core/helpers'
        const helpers = require('@example/api/core/helpers/testing')
      `),
    ).toHaveLength(2)
  })

  it('finds every deprecated crudAuth annotation', () => {
    expect(
      getCrudAuthAnnotationLines(`
        /// @crudAuth: { "readOne": "user" }
        model User {}
        /// @crudAuth: { "readMany": "public" }
      `),
    ).toEqual([2, 4])
  })

  it('allows explicit admin-prefixed operations but rejects generated CRUD collisions', () => {
    expect(
      getCustomResolverNameViolations(
        `
          @Resolver(() => User)
          class UserResolver {
            @Mutation(() => User)
            adminDeleteUser() {}

            @Mutation(() => User)
            updateUser() {}
          }
        `,
        new Set(['updateUser', 'deleteUser']),
      ),
    ).toEqual([
      expect.objectContaining({
        message: 'Custom resolver method "updateUser" collides with a generated CRUD field name',
      }),
    ])
  })

  it('rejects application SDK operations that call generated admin CRUD fields', () => {
    const generatedFields = getGraphqlRootFieldNames(`
      query __AdminUsers($input: ListUserInput) {
        users(input: $input) { id }
        count: usersCount(input: $input) { count }
      }
    `)

    expect(
      getPublicSdkGeneratedCrudViolations(
        `
          query ActiveUsers {
            results: users(input: { filters: { isActive: { equals: true } } }) { id }
          }
        `,
        generatedFields,
      ),
    ).toEqual([
      expect.objectContaining({
        line: 3,
        message: expect.stringContaining('ActiveUsers calls generated admin CRUD field users'),
      }),
    ])
  })

  it('rejects generated admin CRUD fields behind root-level inline fragments', () => {
    expect(
      getPublicSdkGeneratedCrudViolations(
        `
          query ActiveUsers {
            ... on Query {
              users { id }
            }
          }
        `,
        new Set(['users']),
      ),
    ).toEqual([
      expect.objectContaining({
        line: 4,
        message: expect.stringContaining('ActiveUsers calls generated admin CRUD field users'),
      }),
    ])
  })

  it('rejects generated admin CRUD fields behind root-level named fragments', () => {
    expect(
      getPublicSdkGeneratedCrudViolations(
        `
          query ActiveUsers {
            ...GeneratedUsers
          }
          fragment GeneratedUsers on Query {
            users { id }
          }
        `,
        new Set(['users']),
      ),
    ).toEqual([
      expect.objectContaining({
        line: 3,
        message: expect.stringContaining('ActiveUsers calls generated admin CRUD field users'),
      }),
    ])
  })

  it('rejects generated admin CRUD fields from root fragments in another SDK file', () => {
    expect(
      getPublicSdkGeneratedCrudViolations(
        `
          query ActiveUsers {
            ...GeneratedUsers
          }
        `,
        new Set(['users']),
        [
          `
            fragment GeneratedUsers on Query {
              users { id }
            }
          `,
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        line: 3,
        message: expect.stringContaining('ActiveUsers calls generated admin CRUD field users'),
      }),
    ])
  })

  it('accepts purpose-built application SDK operations and fragments', () => {
    const generatedFields = new Set(['users', 'usersCount', 'updateUser'])
    expect(
      getPublicSdkGeneratedCrudViolations(
        `
          query MyProfile { me { ...UserDetails } }
          mutation UpdateMyProfile($input: UpdateMyProfileInput!) {
            updateMyProfile(input: $input) { ...UserDetails }
          }
          fragment UserDetails on User { id }
        `,
        generatedFields,
      ),
    ).toEqual([])
  })

  it('accepts class-level admin protection for every resolver operation', () => {
    expect(
      getNonAdminOperationViolations(`
        @Resolver(() => Email)
        @UseGuards(GqlAuthAdminGuard)
        @AdminOnly()
        class AdminEmailResolver {
          @Mutation(() => Email)
          update() {}
        }
      `),
    ).toEqual([])
  })

  it('reports both a missing admin guard and missing admin declaration', () => {
    const violations = getNonAdminOperationViolations(`
      @Resolver(() => User)
      class UserResolver {
        @Query(() => User)
        @UseGuards(GqlAuthGuard)
        @Authenticated()
        user() {}
      }
    `)

    expect(violations.map(violation => violation.message)).toEqual([
      'UserResolver.user must use GqlAuthAdminGuard',
      'UserResolver.user must declare @AdminOnly()',
    ])
  })
})
