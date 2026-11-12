// @vitest-environment node
import type { LoaderFunctionArgs } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CombinedGraphQLErrors, ServerError } from '@apollo/client'
import { loader } from '../app/root'

// The root loader's catch for a Me preload that throws. Only an HTTP 401 or an UNAUTHENTICATED
// GraphQL error is a rejected session; an error whose message merely says "Unauthorized" or "401"
// keeps it. The preload is replaced so it throws the error under test.
const preload = vi.hoisted(() => ({ error: undefined as unknown }))

vi.mock('@nestled-template/shared/apollo', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/apollo')>()
  return {
    ...actual,
    apolloLoader:
      () =>
      (loader: (args: Record<string, unknown>) => unknown) =>
      (args: Record<string, unknown>) =>
        loader({
          ...args,
          preloadQuery: () => {
            throw preload.error
          },
        }),
  }
})

const COOKIE_NAME = '__session'

function unexpiredJwt(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url')
  return `header.${payload}.signature`
}

async function loadSignedIn(path = '/members/dashboard') {
  const request = new Request(`http://localhost${path}`, {
    headers: { cookie: `${COOKIE_NAME}=${unexpiredJwt()}; theme=dark` },
  })
  return loader({ request, params: {}, context: {} } as unknown as LoaderFunctionArgs)
}

function clearsTheCookie(result: unknown): boolean {
  return (
    result instanceof Response &&
    result.headers
      .getSetCookie()
      .some(cookie => cookie.startsWith(`${COOKIE_NAME}=;`) && cookie.includes('Expires=Thu'))
  )
}

describe('root loader when the Me preload throws', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    preload.error = undefined
  })

  it.each([
    ['says "Unauthorized"', new Error('Unauthorized')],
    ['mentions "401"', new Error('Request failed with status 401')],
    [
      'is a GraphQL error that says "Unauthorized" with no UNAUTHENTICATED code',
      new CombinedGraphQLErrors({ data: null, errors: [{ message: 'Unauthorized' }] }),
    ],
  ])('keeps the session when the error only %s', async (_label, error) => {
    preload.error = error

    const result = await loadSignedIn()

    expect(result).not.toBeInstanceOf(Response)
    expect(clearsTheCookie(result)).toBe(false)
    expect(result).toEqual({ serviceUnavailable: true, theme: 'dark' })
  })

  it.each([
    [
      'an HTTP 401',
      new ServerError('Response not successful', {
        response: new Response(null, { status: 401 }),
        bodyText: '',
      }),
    ],
    [
      'an UNAUTHENTICATED GraphQL error',
      new CombinedGraphQLErrors({
        data: null,
        errors: [{ message: 'Session expired', extensions: { code: 'UNAUTHENTICATED' } }],
      }),
    ],
  ])('clears the cookie and redirects to login on %s', async (_label, error) => {
    preload.error = error

    const result = await loadSignedIn()

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(302)
    expect((result as Response).headers.get('Location')).toBe(
      `/login?return_url=${encodeURIComponent('/members/dashboard')}&expired=1`,
    )
    expect(clearsTheCookie(result)).toBe(true)
  })
})
