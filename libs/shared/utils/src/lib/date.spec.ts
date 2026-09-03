import { describe, expect, it } from 'vitest'
import {
  formatLocalLongDateTime,
  formatUtcForDateInput,
  formatUtcLongDate,
  isIsoDateTimeString,
  toUtcMidnightIso,
} from './date'

describe('date utilities', () => {
  it('formats UTC dates for date inputs', () => {
    expect(formatUtcForDateInput('2026-05-16T23:30:00.000Z')).toBe('2026-05-16')
    expect(formatUtcForDateInput(new Date('invalid'))).toBe('')
    expect(formatUtcForDateInput(null)).toBe('')
  })

  it('formats long dates in UTC without local-timezone day shift', () => {
    // Calendar date stored at midnight UTC must render the same calendar day
    // regardless of the viewer's timezone (the PIR-145 day-behind bug).
    expect(formatUtcLongDate('2024-12-25T00:00:00.000Z')).toBe('December 25, 2024')
    expect(formatUtcLongDate(new Date('2024-12-25T00:00:00.000Z'))).toBe('December 25, 2024')
    expect(formatUtcLongDate(null)).toBe('')
    expect(formatUtcLongDate(undefined)).toBe('')
    expect(formatUtcLongDate('')).toBe('')
    expect(formatUtcLongDate(new Date('invalid'))).toBe('')
  })

  it('pins date values to UTC midnight', () => {
    expect(toUtcMidnightIso('2026-05-16')).toBe('2026-05-16T00:00:00Z')
    expect(toUtcMidnightIso('2026-05-16T23:30:00.000Z')).toBe('2026-05-16T00:00:00Z')
    expect(toUtcMidnightIso(new Date('2026-05-16T23:30:00.000Z'))).toBe('2026-05-16T00:00:00Z')
  })

  it('detects ISO-8601 datetimes without consulting a field name', () => {
    expect(isIsoDateTimeString('2026-05-16T12:30:00.000Z')).toBe(true)
    expect(isIsoDateTimeString('2026-05-16T12:30:00Z')).toBe(true)
    expect(isIsoDateTimeString('2026-05-16T12:30')).toBe(true)
    expect(isIsoDateTimeString('2026-05-16T12:30:00+05:30')).toBe(true)

    // A bare calendar day is not a timestamp, and neither is prose that merely looks date-ish.
    expect(isIsoDateTimeString('2026-05-16')).toBe(false)
    expect(isIsoDateTimeString('pending review')).toBe(false)
    expect(isIsoDateTimeString('2026-13-45T99:99:99Z')).toBe(false)
    expect(isIsoDateTimeString(42)).toBe(false)
    expect(isIsoDateTimeString(null)).toBe(false)
  })

  it('formats timestamps in local terms, keeping the time', () => {
    const instant = new Date('2026-05-16T12:30:00.000Z')
    const localDay = instant.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const localTime = instant.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    expect(formatLocalLongDateTime(instant)).toBe(`${localDay} ${localTime}`)
    expect(formatLocalLongDateTime('2026-05-16T12:30:00.000Z')).toBe(`${localDay} ${localTime}`)
    expect(formatLocalLongDateTime(null)).toBe('')
    expect(formatLocalLongDateTime('')).toBe('')
    expect(formatLocalLongDateTime(new Date('invalid'))).toBe('')
  })

  it('formats the epoch rather than blanking it', () => {
    // A `!value` emptiness test also discards 0, which is a real instant -- midnight UTC on
    // 1970-01-01. Blanking it hides whatever produced it.
    expect(formatUtcLongDate(0)).toBe('January 1, 1970')
    expect(formatUtcForDateInput(0)).toBe('1970-01-01')
    expect(formatLocalLongDateTime(0)).not.toBe('')

    // Genuinely absent values are still empty.
    expect(formatUtcLongDate(Number.NaN)).toBe('')
    expect(formatUtcForDateInput(Number.NaN)).toBe('')
    expect(formatLocalLongDateTime(Number.NaN)).toBe('')
  })

  it('rejects date-like prose that Date would otherwise accept', () => {
    // `new Date('May 16, 2026')` parses, so validity alone is not enough -- the shape test is
    // what keeps a table cell from formatting arbitrary text.
    expect(isIsoDateTimeString('May 16, 2026')).toBe(false)
    expect(isIsoDateTimeString('2026/05/16 12:30')).toBe(false)
  })
})
