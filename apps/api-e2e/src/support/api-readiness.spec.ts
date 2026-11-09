import { describe, expect, it, vi } from 'vitest'
import {
  API_OUTPUT_TAIL_LINES,
  DEFAULT_API_START_TIMEOUT_SECONDS,
  apiStartTimeoutSeconds,
  lastOutputLines,
} from './api-readiness'

describe('apiStartTimeoutSeconds', () => {
  it('defaults to a budget long enough for a cold build', () => {
    expect(apiStartTimeoutSeconds({})).toBe(DEFAULT_API_START_TIMEOUT_SECONDS)
    expect(DEFAULT_API_START_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(180)
  })

  it('uses E2E_API_START_TIMEOUT_SECONDS when it is a positive whole number', () => {
    expect(apiStartTimeoutSeconds({ E2E_API_START_TIMEOUT_SECONDS: '420' })).toBe(420)
    expect(apiStartTimeoutSeconds({ E2E_API_START_TIMEOUT_SECONDS: ' 90 ' })).toBe(90)
  })

  it('falls back to the default, and says so, for an unusable value', () => {
    for (const value of ['0', '-5', '1.5', 'ten', '60s']) {
      const warn = vi.fn()
      expect(apiStartTimeoutSeconds({ E2E_API_START_TIMEOUT_SECONDS: value }, warn)).toBe(
        DEFAULT_API_START_TIMEOUT_SECONDS,
      )
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0][0]).toContain(value)
    }
  })

  it('treats an empty value as unset', () => {
    const warn = vi.fn()
    expect(apiStartTimeoutSeconds({ E2E_API_START_TIMEOUT_SECONDS: '  ' }, warn)).toBe(
      DEFAULT_API_START_TIMEOUT_SECONDS,
    )
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('lastOutputLines', () => {
  it('keeps only the last lines, skipping blank ones', () => {
    const output = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n\n')
    const tail = lastOutputLines(output).split('\n')
    expect(tail).toHaveLength(API_OUTPUT_TAIL_LINES)
    expect(tail[0]).toBe(`line ${100 - API_OUTPUT_TAIL_LINES + 1}`)
    expect(tail.slice(-1)).toEqual(['line 100'])
  })

  it('handles Windows line endings and a custom count', () => {
    expect(lastOutputLines('a\r\nb\r\nc\r\n', 2)).toBe('b\nc')
  })

  it('says so when the API printed nothing', () => {
    expect(lastOutputLines('')).toBe('(the API printed nothing)')
    expect(lastOutputLines('\n \n')).toBe('(the API printed nothing)')
  })
})
