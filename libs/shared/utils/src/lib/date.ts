import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/**
 * Format a Date or ISO string as YYYY-MM-DD using UTC semantics, suitable for date inputs
 */
export function formatUtcForDateInput(value: Date | string | number | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value
  if (!(d instanceof Date) || isNaN(d.getTime())) return ''
  return dayjs.utc(d).format('YYYY-MM-DD')
}

/**
 * Convert a YYYY-MM-DD string or Date into an ISO string pinned to midnight UTC
 */
export function toUtcMidnightIso(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}T00:00:00Z`
  }
  if (typeof value === 'string') {
    // If a full ISO is provided, normalize to its UTC date @ 00:00
    if (value.includes('T')) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${dd}T00:00:00Z`
      }
    }
    // Assume YYYY-MM-DD
    return `${value}T00:00:00Z`
  }
  // Fallback
  return new Date().toISOString()
}


