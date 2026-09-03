import type { ReactNode } from 'react'
import { formatLocalLongDateTime, formatUtcLongDate, isIsoDateTimeString } from './date'

/**
 * The Prisma metadata a table cell needs in order to render a temporal column correctly.
 *
 * Structural rather than an import of `DatabaseField`, because this module is consumed by the
 * published `@nestledjs/shared-components` and must not depend on generated SDK types.
 */
export interface DateFieldMeta {
  readonly type?: string
  readonly documentation?: string
}

/** Matched as a whole token, so `@dateOnlyDeprecated` is not read as `@dateOnly`. */
const DATE_ONLY_ANNOTATION = /@dateOnly\b/

/**
 * PostgreSQL-backed Prisma models express every temporal column as `DateTime`, so a column that
 * is conceptually a calendar day (a birth date, a due date) is indistinguishable from a true
 * timestamp by type alone. `/// @dateOnly` in `schema.prisma` marks the former; the crud
 * generator already copies a field's doc comment into `DatabaseField.documentation`, so the
 * annotation reaches the client with no generator change.
 *
 * A calendar day is stored at midnight UTC and must be rendered on the UTC calendar, or the
 * viewer's offset moves it to the previous day west of UTC. A timestamp marks an instant and
 * must be rendered locally. Getting this backwards in either direction is the defect class
 * documented in 2026-09-01-data-browser-datetime-local-round-trip.
 */
export function isDateOnlyField(field?: DateFieldMeta): boolean {
  // A provider that does expose a native date scalar needs no annotation.
  if (field?.type?.toLowerCase() === 'date') return true
  return DATE_ONLY_ANNOTATION.test(field?.documentation ?? '')
}

function isTemporalField(field?: DateFieldMeta): boolean {
  const type = field?.type?.toLowerCase()
  return type === 'datetime' || type === 'date'
}

function stringifyTableValue(value: unknown): string {
  if (value === null || value === undefined) return ''

  switch (typeof value) {
    case 'string':
      return value
    case 'number':
    case 'boolean':
    case 'bigint':
      return `${value}`
    case 'symbol':
      return value.description ?? ''
    case 'function':
      return value.name || '[function]'
    case 'object':
      return JSON.stringify(value)
    default:
      return ''
  }
}

/**
 * Read `fieldPath` off `item`, formatting temporal values for display.
 *
 * Formatting is driven by the field's METADATA and, failing that, by the SHAPE OF THE VALUE --
 * never by the field's name. The previous `fieldPath.includes('date')` test was wrong in both
 * directions: it caught `mandateNotes` and `validateStatus` and rendered their text as
 * `Invalid Date`, while `createdAt` (which does not contain the substring that `updatedAt`
 * happens to contain) fell through and rendered as a raw ISO string.
 *
 * Pass `field` wherever the caller has the model to hand -- it is the only way to know that a
 * `DateTime` column is really a calendar day. Without it a timestamp is assumed, which is the
 * truthful reading of a Prisma `DateTime` and leaves un-annotated projects unchanged.
 */
export function getNestedProperty(item: any, fieldPath: string, field?: DateFieldMeta): unknown {
  const value = fieldPath.split('.').reduce((obj: any, key) => obj?.[key], item)
  if (value === null || value === undefined || value === '') return value

  if (isTemporalField(field)) {
    const temporal = value as Date | string | number
    return isDateOnlyField(field) ? formatUtcLongDate(temporal) : formatLocalLongDateTime(temporal)
  }

  // A caller that supplied metadata has already told us this column is not temporal.
  if (field) return value

  return isIsoDateTimeString(value) ? formatLocalLongDateTime(value) : value
}

export function renderValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return ''

  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    const labels = value.map(entry => {
      if (entry === null || entry === undefined) return ''
      if (typeof entry === 'object') {
        const obj = entry as Record<string, unknown>
        const rawLabel = obj.name ?? obj.title ?? obj.id ?? obj.slug
        if (typeof rawLabel === 'string' || typeof rawLabel === 'number') return `${rawLabel}`
        return JSON.stringify(obj)
      }
      return stringifyTableValue(entry)
    })
    return labels.filter(Boolean).join(', ')
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const rawLabel = obj.name ?? obj.title ?? obj.id ?? obj.slug
    if (typeof rawLabel === 'string' || typeof rawLabel === 'number') return `${rawLabel}`
    return JSON.stringify(obj)
  }

  return stringifyTableValue(value)
}

export function formatFieldName(fieldName: string): string {
  return fieldName
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
