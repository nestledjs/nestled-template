import { ForbiddenException } from '@nestjs/common'
import { createSelect, runWithViewer, Viewer } from '../index'

// `User` carries no @crudAuth annotation, so it defaults to admin — the same default the generated
// resolvers use. `Address` relates to it, which is the traversal these tests exercise.
const infoFor = (typeName: string, selection: Record<string, unknown>) =>
  ({
    returnType: { name: typeName },
    fieldNodes: [
      {
        selectionSet: {
          selections: Object.entries(selection).map(([name, value]) => ({
            kind: 'Field',
            name: { kind: 'Name', value: name },
            selectionSet:
              value && typeof value === 'object'
                ? {
                    selections: Object.keys(value as Record<string, unknown>).map(child => ({
                      kind: 'Field',
                      name: { kind: 'Name', value: child },
                    })),
                  }
                : undefined,
          })),
        },
      },
    ],
    fragments: {},
    variableValues: {},
  }) as never

const anonymous: Viewer = { isAuthenticated: false, isSuperAdmin: false }
const authenticated: Viewer = { isAuthenticated: true, isSuperAdmin: false }
const superAdmin: Viewer = { isAuthenticated: true, isSuperAdmin: true }

describe('createSelect relation traversal authorization', () => {
  it('selects scalar fields regardless of viewer', () => {
    const select = createSelect(infoFor('Address', { id: true, city: true }), anonymous)

    expect(select).toEqual({ id: true, city: true })
  })

  it('lets a super admin traverse into an admin-level relation', () => {
    const select = createSelect(infoFor('Address', { id: true, user: { id: true } }), superAdmin)

    expect(select).toEqual({ id: true, user: { select: { id: true } } })
  })

  it('refuses to traverse into an admin-level relation for a plain authenticated caller', () => {
    // This is the escalation the guards cannot see: no second resolver runs for a nested relation,
    // so without this check the related rows arrive as extra columns on the root query.
    expect(() =>
      createSelect(infoFor('Address', { id: true, user: { id: true } }), authenticated),
    ).toThrow(ForbiddenException)
  })

  it('refuses to traverse for an anonymous caller', () => {
    expect(() =>
      createSelect(infoFor('Address', { id: true, user: { id: true } }), anonymous),
    ).toThrow(ForbiddenException)
  })

  it('names the relation and the related model so the refusal is diagnosable', () => {
    expect(() => createSelect(infoFor('Address', { user: { id: true } }), authenticated)).toThrow(
      /Address\.user.*User/,
    )
  })

  it('denies by default when no viewer was established for the request', () => {
    // An absent viewer is indistinguishable from a misconfigured interceptor, so it must not be
    // treated as trusted.
    expect(() => createSelect(infoFor('Address', { user: { id: true } }), undefined)).toThrow(
      ForbiddenException,
    )
  })

  it('reads the viewer from the request-scoped context when none is passed', () => {
    runWithViewer(superAdmin, () => {
      expect(createSelect(infoFor('Address', { user: { id: true } }))).toEqual({
        user: { select: { id: true } },
      })
    })

    runWithViewer(authenticated, () => {
      expect(() => createSelect(infoFor('Address', { user: { id: true } }))).toThrow(
        ForbiddenException,
      )
    })
  })
})
