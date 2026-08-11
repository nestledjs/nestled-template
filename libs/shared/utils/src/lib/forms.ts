import { Maybe } from 'graphql/jsutils/Maybe'
import type { FormField } from '@nestledjs/forms-core'

type SelectOption = {
  value?: unknown
}

type RelationItem = {
  id: string
  name?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSelectOption(value: unknown): value is SelectOption {
  return isRecord(value) && 'value' in value
}

/**
 * Only used for the multiselect path, whose output is relation ids (`{ id: String(value) }`).
 * A boolean is a legitimate SELECT option value but never a legitimate relation id — admitting it
 * here would connect relations to ids named "true"/"false". Plain selects go through
 * `isSelectOption`, which still allows booleans.
 */
function isSelectOptionWithValue(value: unknown): value is { value: string | number } {
  return (
    isSelectOption(value) && (typeof value.value === 'string' || typeof value.value === 'number')
  )
}

function isRelationItem(value: unknown): value is RelationItem {
  return isRecord(value) && typeof value['id'] === 'string'
}

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

function formatDate(value: unknown): string {
  if (typeof value === 'object' && value instanceof Date) {
    return value.toISOString().split('T')[0]
  } else if (typeof value === 'string') {
    return value.split('T')[0]
  }
  return ''
}

/**
 * Strings are treated as existing form values: an ISO datetime (contains `T`) is cut to its date
 * part, and any other string passes through untouched — including non-date garbage, which is the
 * form's problem to validate, not this formatter's. Dates and numeric timestamps are validated
 * before formatting: `toISOString` THROWS on an invalid date, so an unguarded call turns one bad
 * field value into a crashed submit instead of an empty value.
 */
function cleanDateFieldValue(value: unknown) {
  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value
  }

  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : null
  if (date && !Number.isNaN(date.getTime())) {
    return date.toISOString().split('T')[0]
  }

  return ''
}

export function cleanFormInput(
  obj: Record<string, unknown>,
  fields?: FormField[],
  keepId?: boolean,
) {
  // Get all keys from the fields array
  const validKeys = fields?.map(field => field.key) || []

  // Update field type checking for new @nestledjs/forms types
  const selectFields = fields
    ?.filter(field => field.type === 'SearchSelectApollo')
    .map(field => field.key)
  const multiSelectFields = fields
    ?.filter(
      field => field.type === 'SearchSelectMultiApollo' || field.type === 'SearchSelectMulti',
    )
    .map(field => field.key)
  return Object.fromEntries(
    Object.entries(obj)
      // Remove id, __typename, updatedAt, createdAt, and empty fields
      .filter(([k, v]) => {
        return (
          validKeys.includes(k) &&
          !(
            // (!checkboxFields?.includes(k) && v === undefined) ||
            // (!checkboxFields?.includes(k) && !v) ||
            // (!checkboxFields?.includes(k) && v === '') ||
            (
              (Array.isArray(v) && !v.length) ||
              k === 'createdAt' ||
              k === 'updatedAt' ||
              k === '__typename' ||
              (!keepId && k === 'id') ||
              (v instanceof Date && !isValidDate(v))
            )
          )
        )
      })
      .map(([k, v]) => {
        // Reformat date strings for storage in database
        if (k.toLowerCase().includes('date') || k.toLowerCase().includes('datetime')) {
          return [k, cleanDateFieldValue(v)]
        }
        // Return array of values for multiselect fields
        if (multiSelectFields?.includes(k)) {
          return [
            k,
            Array.isArray(v)
              ? v.filter(isSelectOptionWithValue).map(item => ({ id: String(item.value) }))
              : undefined,
          ]
        }
        // Return value only for select fields
        if (selectFields?.includes(k)) {
          return [k, isSelectOption(v) ? v.value : undefined]
        }
        return [k, v]
      }),
  )
}

export function cleanDatabaseOutput(
  obj: Record<string, unknown>,
  fields?: FormField[],
  resolverFields?: string[],
  keepId?: boolean,
) {
  const createdDate = formatDate(obj['createdAt']) // Getting and formatting the createdDate from the input object

  // Update field type checking for new @nestledjs/forms types
  const selectFields = fields
    ?.filter(field => field.type === 'Select' || field.type === 'EnumSelect')
    .map(field => field.key)
  const multiSelectFields = fields
    ?.filter(field => field.type === 'MultiSelect' || field.type === 'SearchSelectMulti')
    .map(field => field.key)

  return Object.fromEntries(
    Object.entries(obj)
      // Remove id, __typename, updatedAt, createdAt, and empty fields
      .filter(([k, v]) => {
        return !(
          v === undefined ||
          !v ||
          v === '' ||
          (Array.isArray(v) && !v.length) ||
          k === 'createdAt' ||
          k === 'updatedAt' ||
          k === '__typename' ||
          (!keepId && k === 'id') ||
          (v instanceof Date && !isValidDate(v)) ||
          resolverFields?.includes(k)
        )
      })
      .map(([k, v]) => {
        // Reformat date strings for storage in database
        if (k.includes('Date') || k.includes('date')) {
          return [k, formatDate(v)]
        }

        // Check if the key is 'referralDate' and value is null, then set createdDate as the referralDate
        if (k === 'referralDate' && v === null) {
          return [k, createdDate]
        }

        // Return array of values for multiselect fields
        if (multiSelectFields?.includes(k)) {
          return [k, defaultMultiMap(v)]
        }
        // Return value for single select fields
        if (selectFields?.includes(`${k}Id`)) {
          const field = fields?.find(f => f.key.slice(0, -2) === k)
          return [field?.key, defaultSingleMap(v)]
        }
        return [k, v]
      }),
  )
}

function defaultMultiMap(items: unknown): { value: string; label: string }[] {
  if (!Array.isArray(items)) return []

  return items.filter(isRelationItem).map(option => ({
    value: `${option.id}`,
    label: `${option?.name ?? option.id}`,
  }))
}

export function defaultSingleMap(item: unknown): {
  value: Maybe<string> | undefined
  label: string
} {
  if (!isRelationItem(item)) {
    return {
      value: undefined,
      label: '',
    }
  }

  return {
    value: item.id,
    label: `${item?.name ?? item.id}`,
  }
}
