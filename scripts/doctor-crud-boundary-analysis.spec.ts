import { describe, expect, it } from 'vitest'
import {
  getCrudAuthAnnotationLines,
  getCustomCrudImportViolations,
  getLegacyCoreHelpersImportViolations,
  getNonAdminOperationViolations,
  supportsAdminOnlyGeneratorBoundary,
} from './doctor-crud-boundary-analysis'

describe('generated CRUD boundary analysis', () => {
  it('requires the strict-compatible Generator 3 admin-only contract', () => {
    expect(supportsAdminOnlyGeneratorBoundary('2.0.0')).toBe(false)
    expect(supportsAdminOnlyGeneratorBoundary('3.0.0')).toBe(false)
    expect(supportsAdminOnlyGeneratorBoundary('3.0.1')).toBe(false)
    expect(supportsAdminOnlyGeneratorBoundary('3.0.2')).toBe(true)
    expect(supportsAdminOnlyGeneratorBoundary('3.1.0')).toBe(true)
    expect(supportsAdminOnlyGeneratorBoundary('4.1.0-beta.1')).toBe(true)
    expect(supportsAdminOnlyGeneratorBoundary('workspace:*')).toBe(false)
  })

  it('rejects generated CRUD imports from application API code', () => {
    const violations = getCustomCrudImportViolations(`
      import type { ListUserInput } from '@example/api/generated-crud/data-access'
      const service = require('@example/api/generated-crud/feature')
    `)

    expect(violations).toHaveLength(2)
    expect(violations[0].message).toContain('explicit input/query')
  })

  it('does not reject the normal explicit Prisma data-access wrapper', () => {
    expect(
      getCustomCrudImportViolations(`
        import { ApiCoreDataAccessService } from '@example/api/core/data-access'
      `),
    ).toEqual([])
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
