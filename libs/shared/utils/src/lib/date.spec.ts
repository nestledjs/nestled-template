import { describe, expect, it } from 'vitest'
import { formatUtcForDateInput, toUtcMidnightIso } from './date'

describe('date utilities', () => {
  it('formats UTC dates for date inputs', () => {
    expect(formatUtcForDateInput('2026-05-16T23:30:00.000Z')).toBe('2026-05-16')
    expect(formatUtcForDateInput(new Date('invalid'))).toBe('')
    expect(formatUtcForDateInput(null)).toBe('')
  })

  it('pins date values to UTC midnight', () => {
    expect(toUtcMidnightIso('2026-05-16')).toBe('2026-05-16T00:00:00Z')
    expect(toUtcMidnightIso('2026-05-16T23:30:00.000Z')).toBe('2026-05-16T00:00:00Z')
    expect(toUtcMidnightIso(new Date('2026-05-16T23:30:00.000Z'))).toBe('2026-05-16T00:00:00Z')
  })
})
