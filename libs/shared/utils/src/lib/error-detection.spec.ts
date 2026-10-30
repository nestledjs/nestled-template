import { describe, expect, it, vi } from 'vitest'
import {
  handleViteCacheError,
  isAuthError,
  isFetchFailure,
  isNetworkError,
  isViteCacheError,
} from './error-detection'

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

  it('recognises each browser fetch failure and nothing else', () => {
    for (const message of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'fetch failed',
      'The network connection was lost.',
      'The Internet connection appears to be offline.',
    ]) {
      expect(isFetchFailure(new TypeError(message))).toBe(true)
      expect(isNetworkError(new TypeError(message))).toBe(true)
    }
    expect(isFetchFailure(new TypeError('Image load failed'))).toBe(false)
    expect(isFetchFailure(new Error('Something else'))).toBe(false)
    expect(isFetchFailure(null)).toBe(false)
  })

  it('does not treat an ordinary TypeError as a network failure', () => {
    // These used to replace the whole app with the "API unavailable" screen.
    expect(
      isNetworkError(new TypeError("Cannot read properties of undefined (reading 'id')")),
    ).toBe(false)
    expect(isNetworkError(new TypeError('x.map is not a function'))).toBe(false)
  })

  describe('isAuthError', () => {
    it('classifies GraphQL codes into the two states', () => {
      expect(
        isAuthError({ graphQLErrors: [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }] }),
      ).toMatchObject({ isAuth: true, type: 'unauthenticated' })
      expect(
        isAuthError({ graphQLErrors: [{ message: 'x', extensions: { code: 'FORBIDDEN' } }] }),
      ).toMatchObject({ isAuth: true, type: 'forbidden' })
    })

    it('resolves the ambiguous UNAUTHORIZED family by whether the message suggests re-login', () => {
      // Same rule on both paths — this once diverged, routing identical error text to logout or
      // to the access-denied panel depending on which shape it arrived in.
      expect(
        isAuthError({
          graphQLErrors: [
            { message: 'You must be logged in', extensions: { code: 'UNAUTHORIZED' } },
          ],
        }),
      ).toMatchObject({ isAuth: true, type: 'unauthenticated' })
      expect(
        isAuthError({
          graphQLErrors: [{ message: 'Unauthorized action', extensions: { code: 'UNAUTHORIZED' } }],
        }),
      ).toMatchObject({ isAuth: true, type: 'forbidden' })
      expect(isAuthError({ message: 'Unauthorized: please log in again' })).toMatchObject({
        isAuth: true,
        type: 'unauthenticated',
      })
      expect(isAuthError({ message: 'Unauthorized resource' })).toMatchObject({
        isAuth: true,
        type: 'forbidden',
      })
    })

    it('classifies raw messages and HTTP status fallbacks', () => {
      expect(isAuthError({ message: 'User is not authenticated' })).toMatchObject({
        isAuth: true,
        type: 'unauthenticated',
      })
      expect(isAuthError({ message: 'Access denied for role' })).toMatchObject({
        isAuth: true,
        type: 'forbidden',
      })
      expect(isAuthError({ message: 'boom', statusCode: 401 })).toMatchObject({
        isAuth: true,
        type: 'unauthenticated',
      })
      expect(isAuthError({ message: 'boom', status: 403 })).toMatchObject({
        isAuth: true,
        type: 'forbidden',
      })
    })

    it('reports non-auth and non-object errors as not auth', () => {
      expect(isAuthError(new Error('database timeout'))).toMatchObject({
        isAuth: false,
        type: null,
      })
      expect(isAuthError(null)).toMatchObject({ isAuth: false, type: null })
      expect(isAuthError('unauthorized')).toMatchObject({ isAuth: false, type: null })
    })
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
      value: { location: { reload } },
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
