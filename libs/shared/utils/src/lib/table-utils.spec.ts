import { describe, expect, it } from 'vitest'
import { formatFieldName, getNestedProperty, renderValue } from './table-utils'

describe('table utils', () => {
  it('reads nested properties and formats date fields', () => {
    const item = {
      user: {
        profile: {
          name: 'Ada',
          startDate: '2026-05-16T12:30:00.000Z',
        },
      },
    }

    expect(getNestedProperty(item, 'user.profile.name')).toBe('Ada')
    expect(getNestedProperty(item, 'user.profile.startDate')).toBe('May 16, 2026')
    expect(getNestedProperty(item, 'user.missing.name')).toBeUndefined()
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
