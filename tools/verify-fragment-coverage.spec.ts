import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSchema } from 'graphql'
import { afterEach, describe, expect, it } from 'vitest'
import {
  annotationListBefore,
  matchingBrace,
  nonNullableAt,
  parentProduced,
  readSelectConstants,
  resolveSpreads,
  sanitize,
  scanObject,
  toSelect,
} from './verify-fragment-coverage'

/**
 * The parser is the whole tool. Its first version reported 584 missing fields against a codebase
 * whose real count was 9, because it looked for a `select` key INSIDE a relation's column list
 * instead of one level up — so every relation silently vanished and every field under it was
 * reported as unproduced. A checker that cries wolf 584 times gets ignored, which is worse than
 * having no checker, so these cases exist to keep that specific mistake from coming back.
 */

const openBraceOf = (source: string): number => source.indexOf('{')

const workspaces: string[] = []

const createSelectWorkspace = (source: string): string => {
  const workspace = mkdtempSync(join(tmpdir(), 'verify-fragment-coverage-'))
  const directory = join(workspace, 'libs/api/custom/src/lib/example')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'example.select.ts'), source)
  workspaces.push(workspace)
  return workspace
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true })
  }
})

describe('toSelect', () => {
  it('captures a relation whose select holds only plain columns', () => {
    // The regression: `{ id: true }` has no `select` of its own, and treating that as
    // "not a relation" dropped `images` entirely.
    const source = `{
      id: true,
      images: {
        select: {
          id: true,
          url: true,
        },
      },
    }`

    expect(toSelect(source, openBraceOf(source))).toEqual({
      id: true,
      images: { select: { id: true, url: true } },
    })
  })

  it('reads columns through several levels of relation', () => {
    const source = `{
      tracks: {
        select: {
          title: true,
          audioFiles: {
            select: { filename: true },
          },
        },
      },
    }`

    expect(toSelect(source, openBraceOf(source))).toEqual({
      tracks: {
        select: {
          audioFiles: { select: { filename: true } },
          title: true,
        },
      },
    })
  })

  it('ignores query arguments sitting beside a relation select', () => {
    // take/orderBy/where are arguments, not columns. Counting them would invent fields that no
    // fragment can ask for and no schema check would ever catch.
    const source = `{
      tracks: {
        orderBy: { order: 'asc' },
        take: 50,
        where: { published: true },
        select: { id: true },
      },
    }`

    expect(toSelect(source, openBraceOf(source))).toEqual({
      tracks: { select: { id: true } },
    })
  })

  it('yields an empty select for a relation that names no columns', () => {
    const source = `{ tracks: { take: 10 } }`

    expect(toSelect(source, openBraceOf(source))).toEqual({ tracks: { select: {} } })
  })

  it('does not treat a false or computed value as a selected column', () => {
    const source = `
      { id: true, secret: false, computed: someHelper() }
      const someHelper = { leaked: true }
    `

    expect(toSelect(source, openBraceOf(source))).toEqual({ id: true })
  })

  it('resolves a relation whose select is a named constant', () => {
    const source = `
      const AUTHOR_SELECT = {
        id: true,
        name: true,
      }

      const POST_SELECT = {
        id: true,
        author: { select: AUTHOR_SELECT },
      }
    `

    expect(toSelect(source, source.indexOf('{', source.indexOf('POST_SELECT')))).toEqual({
      id: true,
      author: { select: { id: true, name: true } },
    })
  })

  it('resolves a relation whose whole value is a named select', () => {
    const source = `
      const AUTHOR_SELECT = { id: true }
      const POST_SELECT = { author: AUTHOR_SELECT }
    `

    expect(toSelect(source, source.indexOf('{', source.indexOf('POST_SELECT')))).toEqual({
      author: { select: { id: true } },
    })
  })

  it('resolves a parameterized select factory and stops identifier cycles', () => {
    const source = `
      const USER_SELECT = (viewerId: string) => ({
        id: true,
        manager: { select: USER_SELECT },
      })
      const POST_SELECT = { author: { select: USER_SELECT } }
    `

    expect(toSelect(source, source.indexOf('{', source.indexOf('POST_SELECT')))).toEqual({
      author: {
        select: {
          id: true,
          manager: { select: {} },
        },
      },
    })
  })
})

describe('readSelectConstants', () => {
  const models = [{ modelName: 'Download', fields: [] }]

  it('attributes an annotated constant whose name does not imply its Prisma model', () => {
    const workspace = createSelectWorkspace(`
      /**
       * @prisma-model Download
       */
      export const USER_DOWNLOADS_SELECT = {
        id: true,
      } as const
    `)

    expect(readSelectConstants(workspace, models)).toMatchObject([
      {
        model: 'Download',
        name: 'USER_DOWNLOADS_SELECT',
        select: { id: true },
      },
    ])
  })

  it('keeps a fragment-partial helper available to spreads without checking it independently', () => {
    const workspace = createSelectWorkspace(`
      /**
       * @prisma-model Download
       * @fragment-partial
       */
      export const USER_DOWNLOADS_SELECT = {
        id: true,
      } as const

      export const DOWNLOAD_SELECT = {
        ...USER_DOWNLOADS_SELECT,
        url: true,
      } as const
    `)

    expect(readSelectConstants(workspace, models)).toMatchObject([
      {
        model: 'Download',
        name: 'DOWNLOAD_SELECT',
        select: { id: true, url: true },
      },
    ])
  })
})

describe('scanObject', () => {
  it('collects spreads so a select composed from another constant can be resolved', () => {
    const source = `{ ...BASE_FIELDS, ownedByOrganizationId: true }`
    const scanned = scanObject(source, openBraceOf(source))

    expect(scanned.spreads).toEqual(['BASE_FIELDS'])
    expect(scanned.entries.map(entry => entry.name)).toEqual(['ownedByOrganizationId'])
  })

  it('reports only the outermost level', () => {
    const source = `{ a: true, rel: { select: { b: true } } }`
    const scanned = scanObject(source, openBraceOf(source))

    expect(scanned.entries.map(entry => entry.name)).toEqual(['a', 'rel'])
  })
})

describe('resolveSpreads', () => {
  /** A spreads B, B spreads C — with A declared FIRST, which is the order-dependent case. */
  const chain = new Map([
    ['A_FIELDS', { select: { a: true as const }, spreads: ['B_FIELDS'] }],
    ['B_FIELDS', { select: { b: true as const }, spreads: ['C_FIELDS'] }],
    ['C_FIELDS', { select: { c: true as const }, spreads: [] }],
  ])

  it('follows a spread chain to its end regardless of declaration order', () => {
    // A single resolution pass gives A only {a, b}: C's fields arrive through B, which has not
    // been resolved yet. Every field reaching A through C would then be reported MISSING.
    expect(resolveSpreads('A_FIELDS', chain)).toEqual({ a: true, b: true, c: true })
  })

  it('resolves a mid-chain constant to its own reachable set', () => {
    expect(resolveSpreads('B_FIELDS', chain)).toEqual({ b: true, c: true })
  })

  it('terminates on a cycle instead of recursing forever', () => {
    // Not valid TypeScript, but this tool parses text rather than evaluating it, so it must not
    // hang on input a compiler would have rejected.
    const cyclic = new Map([
      ['X_FIELDS', { select: { x: true as const }, spreads: ['Y_FIELDS'] }],
      ['Y_FIELDS', { select: { y: true as const }, spreads: ['X_FIELDS'] }],
    ])

    expect(resolveSpreads('X_FIELDS', cyclic)).toEqual({ x: true, y: true })
  })

  it('merges relations from a spread rather than replacing them', () => {
    const withRelation = new Map([
      ['BASE', { select: { rel: { select: { id: true as const } } }, spreads: [] }],
      ['WIDE', { select: { own: true as const }, spreads: ['BASE'] }],
    ])

    expect(resolveSpreads('WIDE', withRelation)).toEqual({
      own: true,
      rel: { select: { id: true } },
    })
  })

  it('returns nothing for a spread of a constant declared in another file', () => {
    const partial = new Map([['A', { select: { a: true as const }, spreads: ['ELSEWHERE'] }]])

    expect(resolveSpreads('A', partial)).toEqual({ a: true })
  })
})

describe('sanitize', () => {
  it('blanks comments without moving any later offset', () => {
    const source = `{ /* id: true */ name: true }`
    const sanitized = sanitize(source)

    expect(sanitized).toHaveLength(source.length)
    expect(toSelect(sanitized, openBraceOf(sanitized))).toEqual({ name: true })
  })

  it('blanks string bodies so a brace inside a string cannot close an object early', () => {
    const source = `{ label: "}", id: true }`
    const sanitized = sanitize(source)

    expect(sanitized).toHaveLength(source.length)
    expect(matchingBrace(sanitized, 0)).toBe(source.length - 1)
  })

  it('keeps newlines so line-based reporting stays accurate', () => {
    const source = `// leading comment\n{ id: true }`

    expect(sanitize(source).split('\n')).toHaveLength(2)
  })

  it('keeps the newline a line-continuation escapes', () => {
    // The escape branch consumes two characters. Blanking the second unconditionally deletes a
    // real line break, so every line number reported after this string is off by one.
    const source = 'const X = { a: "line\\\n", b: true }'

    const sanitized = sanitize(source)
    expect(sanitized).toHaveLength(source.length)
    expect((sanitized.match(/\n/g) ?? []).length).toBe((source.match(/\n/g) ?? []).length)
  })

  it('keeps the newline of a CRLF line continuation', () => {
    const source = 'const X = { a: "line\\\r\n", b: true }'

    expect((sanitize(source).match(/\n/g) ?? []).length).toBe(1)
  })
})

describe('annotationListBefore', () => {
  const constant = 'const ME_SELECT = {'

  it('splits a comma-separated list', () => {
    const raw = `/** @select-omits redFlagged, tokenVersion */\n${constant}`
    expect(annotationListBefore(raw, raw.indexOf(constant), 0, 'select-omits')).toEqual([
      'redFlagged',
      'tokenVersion',
    ])
  })

  it('accumulates repeated tags across lines', () => {
    const raw = `/**\n * @graphql-operations me\n * @graphql-operations UserToken.user\n */\n${constant}`
    expect(annotationListBefore(raw, raw.indexOf(constant), 0, 'graphql-operations')).toEqual([
      'me',
      'UserToken.user',
    ])
  })

  it('does not inherit an annotation that belongs to the previous constant', () => {
    // The window starts where the previous constant's body ended; an annotation
    // before that point documented THAT constant, not this one.
    const raw = `/** @select-omits redFlagged */\nconst A = { a: true }\n${constant}`
    const previousEnd = raw.indexOf('}') + 1
    expect(
      annotationListBefore(raw, raw.indexOf(constant), previousEnd, 'select-omits'),
    ).toEqual([])
  })
})

describe('parentProduced', () => {
  const have = new Set(['id', 'lineItems', 'lineItems.order'])

  it('is trivially true at top level', () => {
    expect(parentProduced(have, 'redFlagged')).toBe(true)
  })

  it('is true when the immediate parent is selected', () => {
    expect(parentProduced(have, 'lineItems.order.id')).toBe(true)
  })

  it('is false when the parent is absent — the parent finding covers the subtree', () => {
    expect(parentProduced(have, 'addresses.id')).toBe(false)
  })
})

describe('nonNullableAt', () => {
  // GraphQL nullability, not Prisma optionality, decides null-versus-error:
  // currentStreak is non-optional in Prisma (it has a default) yet nullable here.
  const schema = buildSchema(`
    type Query { me: User }
    type User {
      id: ID!
      redFlagged: Boolean!
      currentStreak: Int
      trainerType: [String!]!
      favorites: [Experience!]
    }
    type Experience { id: ID!, title: String }
  `)

  it('flags a non-nullable scalar', () => {
    expect(nonNullableAt(schema, 'User', 'redFlagged')).toBe(true)
  })

  it('flags a non-nullable list — omitting it errors exactly like a scalar', () => {
    expect(nonNullableAt(schema, 'User', 'trainerType')).toBe(true)
  })

  it('passes a nullable field', () => {
    expect(nonNullableAt(schema, 'User', 'currentStreak')).toBe(false)
  })

  it('reads nested nullability through a list relation', () => {
    expect(nonNullableAt(schema, 'User', 'favorites.id')).toBe(true)
    expect(nonNullableAt(schema, 'User', 'favorites.title')).toBe(false)
  })

  it('treats an unknown field as nullable rather than guessing', () => {
    expect(nonNullableAt(schema, 'User', 'notAField')).toBe(false)
  })
})
