import { describe, expect, it } from 'vitest'
import { formatFieldName, getNestedProperty, isDateOnlyField, renderValue } from './table-utils'

describe('table utils', () => {
  const DATETIME = { type: 'DateTime' }
  const DATE_ONLY = { type: 'DateTime', documentation: '@dateOnly' }
  const TEXT = { type: 'String' }

  it('reads nested properties', () => {
    const item = { user: { profile: { name: 'Ada' } } }

    expect(getNestedProperty(item, 'user.profile.name')).toBe('Ada')
    expect(getNestedProperty(item, 'user.missing.name')).toBeUndefined()
  })

  it('renders a @dateOnly column on the UTC calendar day, in every zone', () => {
    // Midnight UTC is the previous local day west of UTC and the same day east of it. Reading a
    // calendar day in local terms is what shifts a birth date onto the wrong day.
    const item = { birthDate: '2026-05-16T00:00:00.000Z' }

    expect(getNestedProperty(item, 'birthDate', DATE_ONLY)).toBe('May 16, 2026')
  })

  it('renders a timestamp column in local terms, preserving its time', () => {
    const item = { lastActiveAt: '2026-05-16T12:30:00.000Z' }
    const rendered = getNestedProperty(item, 'lastActiveAt', DATETIME) as string

    // The instant is fixed; the wall-clock reading of it is not, so assert the property that
    // holds in every zone rather than a literal that only holds in UTC.
    const instant = new Date('2026-05-16T12:30:00.000Z')
    const localDay = instant.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const localTime = instant.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    expect(rendered).toBe(`${localDay} ${localTime}`)
    expect(rendered).toMatch(/\d:\d{2} (AM|PM)$/)
  })

  it('never formats by field name', () => {
    // `mandateNotes` and `validateStatus` both contain the substring "date". Formatting them fed
    // ordinary text to a date formatter, which rendered the literal string "Invalid Date".
    expect(getNestedProperty({ mandateNotes: 'pending review' }, 'mandateNotes')).toBe(
      'pending review',
    )
    expect(getNestedProperty({ validateStatus: 'queued' }, 'validateStatus', TEXT)).toBe('queued')
    expect(getNestedProperty({ candidateName: 'Ada' }, 'candidateName')).toBe('Ada')
  })

  it('treats createdAt and updatedAt alike', () => {
    // "updatedAt" contains "date"; "createdAt" does not. Under name matching one was formatted
    // and the other rendered as a raw ISO string, in the same table.
    const item = {
      createdAt: '2026-05-16T12:30:00.000Z',
      updatedAt: '2026-05-16T12:30:00.000Z',
    }

    expect(getNestedProperty(item, 'createdAt', DATETIME)).toBe(
      getNestedProperty(item, 'updatedAt', DATETIME),
    )
    // ...and without metadata, where the value's shape is the only signal available.
    expect(getNestedProperty(item, 'createdAt')).toBe(getNestedProperty(item, 'updatedAt'))
  })

  it('formats ISO values and passes everything else through when no metadata is supplied', () => {
    expect(getNestedProperty({ at: '2026-05-16T12:30:00.000Z' }, 'at')).toMatch(/2026/)
    expect(getNestedProperty({ at: '2026-05-16' }, 'at')).toBe('2026-05-16')
    expect(getNestedProperty({ at: 'not a date' }, 'at')).toBe('not a date')
    expect(getNestedProperty({ at: 42 }, 'at')).toBe(42)
    expect(getNestedProperty({ at: null }, 'at')).toBeNull()
    expect(getNestedProperty({ at: '' }, 'at')).toBe('')
  })

  it('detects the @dateOnly annotation', () => {
    expect(isDateOnlyField(DATE_ONLY)).toBe(true)
    expect(isDateOnlyField({ type: 'DateTime', documentation: 'A birth date. @dateOnly' })).toBe(
      true,
    )
    expect(isDateOnlyField(DATETIME)).toBe(false)
    expect(isDateOnlyField(undefined)).toBe(false)

    // Matched as a whole token, so a longer annotation starting with the same characters is not
    // silently read as @dateOnly.
    expect(isDateOnlyField({ type: 'DateTime', documentation: '@dateOnlyDeprecated' })).toBe(false)
    expect(isDateOnlyField({ type: 'DateTime', documentation: '@dateOnlyish' })).toBe(false)
  })

  it('renders arrays, objects, primitives, and empty values for table cells', () => {
    expect(renderValue(null)).toBe('')
    expect(renderValue(undefined)).toBe('')
    expect(renderValue([])).toBe('')
    expect(renderValue(['admin', 2, true])).toBe('admin, 2, true')
    expect(renderValue([{ name: 'Owner' }, { id: 42 }, { custom: 'value' }])).toBe(
      'Owner, 42, {"custom":"value"}',
    )
    expect(renderValue({ title: 'Quarterly Report' })).toBe('Quarterly Report')
    expect(renderValue({ slug: 'launch-plan' })).toBe('launch-plan')
    expect(renderValue({ custom: 'value' })).toBe('{"custom":"value"}')
    expect(renderValue(Symbol('ready'))).toBe('ready')
    expect(renderValue(function namedHelper() {})).toBe('namedHelper')
  })

  it('formats dotted and camelCase field names for labels', () => {
    expect(formatFieldName('primaryEmail')).toBe('Primary Email')
    expect(formatFieldName('organization.ownerName')).toBe('Organization Owner Name')
  })
})
