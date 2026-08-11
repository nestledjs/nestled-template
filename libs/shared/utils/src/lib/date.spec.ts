import { describe, expect, it } from 'vitest'
import { formatUtcForDateInput, formatUtcLongDate, toUtcMidnightIso } from './date'

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
})
