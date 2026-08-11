import { describe, expect, it } from 'vitest'
import { cleanDatabaseOutput, cleanFormInput, defaultSingleMap } from './forms'

const fields = [
  { key: 'id', type: 'Text' },
  { key: 'name', type: 'Text' },
  { key: 'startDate', type: 'Text' },
  { key: 'ownerId', type: 'Select' },
  { key: 'category', type: 'SearchSelectApollo' },
  { key: 'tags', type: 'SearchSelectMultiApollo' },
  { key: 'roles', type: 'MultiSelect' },
] as any

describe('form utilities', () => {
  it('cleans form input for API mutations', () => {
    expect(
      cleanFormInput(
        {
          id: 'record-1',
          name: 'Ada',
          category: { value: 'cat-1', label: 'Category' },
          tags: [
            { value: 'tag-1', label: 'One' },
            { value: 'tag-2', label: 'Two' },
          ],
          startDate: '2026-05-16T12:30:00.000Z',
          createdAt: 'ignored',
          unknown: 'ignored',
        },
        fields,
      ),
    ).toEqual({
      name: 'Ada',
      category: 'cat-1',
      tags: [{ id: 'tag-1' }, { id: 'tag-2' }],
      startDate: '2026-05-16',
    })
  })

  it('can preserve ids and drops invalid dates while cleaning input', () => {
    expect(
      cleanFormInput({ id: 'record-1', startDate: new Date('invalid') }, fields, true),
    ).toEqual({ id: 'record-1' })
  })

  it('drops invalid multiselect options and stringifies valid ids', () => {
    expect(
      cleanFormInput(
        {
          tags: [
            { value: 'tag-1', label: 'One' },
            { value: 22, label: 'Numeric' },
            { label: 'missing value' },
            null,
            { value: { nested: true }, label: 'bad object' },
            // A boolean is a legitimate SELECT value but never a relation id; admitting it here
            // once produced relation connects against ids named "true".
            { value: true, label: 'boolean' },
          ],
        },
        fields,
      ),
    ).toEqual({
      tags: [{ id: 'tag-1' }, { id: '22' }],
    })
  })

  it('returns an empty value for an invalid numeric timestamp instead of throwing', () => {
    // Invalid Date OBJECTS are filtered before mapping, but a NaN number is not a Date instance,
    // so it reaches the date formatter — where an unguarded toISOString() turns one bad field
    // into a crashed submit.
    expect(cleanFormInput({ startDate: Number.NaN }, fields)).toEqual({ startDate: '' })
  })

  it('maps database output back to form values', () => {
    expect(
      cleanDatabaseOutput(
        {
          id: 'record-1',
          name: 'Ada',
          owner: { id: 'user-1', name: 'Ada Lovelace' },
          roles: [{ id: 'admin', name: 'Admin' }],
          createdAt: '2026-05-15T00:00:00.000Z',
          referralDate: null,
          hidden: 'skip',
          updatedAt: 'ignored',
        },
        fields,
        ['hidden'],
        true,
      ),
    ).toEqual({
      id: 'record-1',
      name: 'Ada',
      ownerId: { value: 'user-1', label: 'Ada Lovelace' },
      roles: [{ value: 'admin', label: 'Admin' }],
    })
  })

  it('formats single select fallbacks with id labels', () => {
    expect(defaultSingleMap({ id: 'fallback-id' })).toEqual({
      value: 'fallback-id',
      label: 'fallback-id',
    })
  })
})
