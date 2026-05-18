import { Maybe } from 'graphql/jsutils/Maybe'
import { FormField } from '@nestledjs/forms-core'

function isValidDate(d: any) {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

function normalizeDateValue(v: unknown): string {
  if (v instanceof Date) return v.toISOString().split('T')[0]
  if (typeof v === 'number') return new Date(v).toISOString().split('T')[0]
  if (typeof v === 'string') {
    return v.includes('T') ? v.split('T')[0] : v
  }
  try {
    const d = new Date(v as any)
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0]
  } catch {}
  return ''
}

function formatDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  } else if (typeof value === 'string') {
    return value.split('T')[0]
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
            (Array.isArray(v) && !v.length) ||
            k === 'createdAt' ||
            k === 'updatedAt' ||
            k === '__typename' ||
            (!keepId && k === 'id') ||
            (v instanceof Date && !isValidDate(v))
          )
        )
      })
      .map(([k, v]) => {
        // Reformat date strings for storage in database
        if (k.toLowerCase().includes('date') || k.toLowerCase().includes('datetime')) {
          return [k, normalizeDateValue(v)]
        }
        // Return array of values for multiselect fields
        if (multiSelectFields?.includes(k)) {
          return [k, (v as any)?.map?.((item: any) => ({ id: item?.value }))]
        }
        // Return value only for select fields
        if (selectFields?.includes(k)) {
          return [k, (v as any)?.['value']]
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
          return [k, defaultMultiMap(v as any)]
        }
        // Return value for single select fields
        if (selectFields?.includes(`${k}Id`)) {
          const field = fields?.find(f => f.key.slice(0, -2) === k)
          return [field?.key, defaultSingleMap(v as any)]
        }
        return [k, v]
      }),
  )
}

function defaultMultiMap(
  items: { id: string; name?: string }[],
): { value: string; label: string }[] {
  return items?.map?.((option: { id: string; name?: string }) => ({
    value: `${option.id}`,
    label: `${option?.name ?? option.id}`,
  }))
}

export function defaultSingleMap(item: { id: string; name?: string }): {
  value: Maybe<string> | undefined
  label: string
} {
  return {
    value: item.id,
    label: `${item?.name ?? item.id}`,
  }
}
