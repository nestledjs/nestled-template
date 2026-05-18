import { describe, expect, it, vi } from 'vitest'
import { handleViteCacheError, isNetworkError, isViteCacheError } from './error-detection'

describe('error detection utilities', () => {
  it('distinguishes Vite cache errors from render errors', () => {
    expect(
      isViteCacheError({
        message: "Cannot read properties of undefined (reading 'useContext')",
        stack: 'at useContext node_modules/.vite/deps/chunk.js',
      }),
    ).toBe(true)
    expect(isViteCacheError({ message: 'Objects are not valid as a React child' })).toBe(false)
    expect(isViteCacheError(null)).toBe(false)
  })

  it('detects network errors without treating auth GraphQL errors as network failures', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ message: 'ECONNREFUSED' })).toBe(true)
    expect(
      isNetworkError({
        graphQLErrors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
      }),
    ).toBe(false)
  })

  it('handles Vite cache errors with delayed reloads', () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { reload },
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    })

    expect(
      handleViteCacheError(
        {
          message: 'useFrameworkContext crashed',
          stack: 'node_modules/.vite/deps/chunk.js',
        },
        true,
        100,
      ),
    ).toBe(true)
    vi.advanceTimersByTime(100)
    expect(reload).toHaveBeenCalled()
  })
})
