import { describe, expect, it } from 'vitest'
import { analyzeAccessPolicies, readStringObjectArray } from './doctor-access-policy-analysis'

describe('analyzeAccessPolicies', () => {
  it('extracts platform and organization permission literals without option prose', () => {
    const report = analyzeAccessPolicies(`
      @Resolver()
      class ResolverUnderTest {
        @Query(() => Boolean)
        @RequirePlatformPermission('platform.users.read', 'platform.users.manage')
        users() {}

        @Mutation(() => Boolean)
        @RequireOrganizationPermission(['member:update'], {
          organizationIdPath: 'input.organizationId',
        })
        updateMember() {}
      }
    `)

    expect(report.declarations.map(item => item.permissions)).toEqual([
      ['platform.users.read', 'platform.users.manage'],
      ['member:update'],
    ])
  })

  it('reports inline permission helpers on an operation with no declarative policy', () => {
    const report = analyzeAccessPolicies(`
      @Controller('reports')
      class ReportController {
        @Post()
        @Authenticated()
        async create() {
          await this.assertPermission('reports:create')
          return this.service.create()
        }
      }
    `)

    expect(report.inlineViolations).toEqual([
      expect.objectContaining({
        className: 'ReportController',
        name: 'create',
        calls: ['assertPermission'],
      }),
    ])
  })

  it('accepts a class-level policy as the declaration for its operations', () => {
    const report = analyzeAccessPolicies(`
      @Resolver()
      @RequirePlatformPermission('platform.audit.read')
      class AuditResolver {
        @Query(() => Boolean)
        audit() {
          return this.hasPermission('platform.audit.read')
        }
      }
    `)

    expect(report.inlineViolations).toEqual([])
    expect(report.declarations).toHaveLength(1)
  })
})

describe('readStringObjectArray', () => {
  it('reads only the named catalog and ignores similarly shaped role metadata', () => {
    const entries = readStringObjectArray(
      `
        export const permissions = [
          { key: 'platform.users.read', namespace: 'platform.users' },
        ] as const
        export const rootRole = { key: 'system.super-administrator' }
      `,
      'permissions',
      ['key'],
    )

    expect(entries).toEqual([{ key: 'platform.users.read' }])
  })

  it('finds the catalog when it is declared inside a function rather than at the top level (#120)', () => {
    // A repo that seeds permissions from a builder must not be handed an empty catalog (which would
    // then report every declared permission as "unknown").
    const entries = readStringObjectArray(
      `
        export function buildCatalog() {
          const permissions = [
            { key: 'platform.users.read' },
            { key: 'platform.users.manage' },
          ]
          return permissions
        }
      `,
      'permissions',
      ['key'],
    )

    expect(entries).toEqual([
      { key: 'platform.users.read' },
      { key: 'platform.users.manage' },
    ])
  })
})
