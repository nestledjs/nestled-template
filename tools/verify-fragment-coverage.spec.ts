import { describe, expect, it } from 'vitest'
import {
  matchingBrace,
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
    const source = `{ id: true, secret: false, computed: someHelper() }`

    expect(toSelect(source, openBraceOf(source))).toEqual({ id: true })
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
