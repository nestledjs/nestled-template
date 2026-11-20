// @vitest-environment node
import { RouterContextProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetApiOutageMemory,
  recordApiOutage,
  SESSION_TIMEOUT_MS,
  SKIP_AUTH_ERROR_REPORT_CONTEXT,
} from '@nestled-template/shared/apollo'
import {
  createSessionMiddleware,
  fetchMeWithApollo,
  resolveSession,
  returnPath,
  sessionRejectedPath,
  SESSIONLESS_PATTERNS,
} from '../../app/session/session-middleware.server'
import { getSession, requireUser, sessionContext } from '../../app/session'

// Hoisted above the imports by vitest, so the session middleware gets this makeClient.
const query = vi.hoisted(() => vi.fn())
vi.mock('@nestled-template/shared/apollo', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/apollo')>()
  return { ...actual, makeClient: vi.fn(() => ({ query })) }
})

function liveCookie(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url')
  return `__session=h.${payload}.s`
}

const signedInRequest = () =>
  new Request('http://localhost/members', { headers: { cookie: liveCookie() } })

beforeEach(() => {
  query.mockReset()
  __resetApiOutageMemory()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('fetchMeWithApollo', () => {
  it("asks for Me fresh, with errorPolicy 'none' and the error link told to stand aside", async () => {
    query.mockResolvedValue({ data: { me: { id: 'user-1' } } })
    const signal = new AbortController().signal

    await expect(fetchMeWithApollo(signedInRequest(), signal)).resolves.toEqual({
      kind: 'user',
      user: { id: 'user-1' },
    })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toMatchObject({
      fetchPolicy: 'no-cache',
      errorPolicy: 'none',
      context: { ...SKIP_AUTH_ERROR_REPORT_CONTEXT, fetchOptions: { signal } },
    })
  })

  it('judges a thrown error by status and code', async () => {
    query.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(
      fetchMeWithApollo(signedInRequest(), new AbortController().signal),
    ).resolves.toEqual({ kind: 'error', cause: 'unauthenticated' })
  })

  it('reports an aborted call as a timeout', async () => {
    const controller = new AbortController()
    controller.abort()
    query.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    await expect(fetchMeWithApollo(signedInRequest(), controller.signal)).resolves.toEqual({
      kind: 'timeout',
    })
  })
})

describe('resolveSession', () => {
  it('makes no call without a live cookie', async () => {
    const fetchMe = vi.fn()
    const { verdict } = await resolveSession(new Request('http://localhost/'), { fetchMe })
    expect(verdict).toEqual({ kind: 'signed-out', reason: 'no-session' })
    expect(fetchMe).not.toHaveBeenCalled()
  })

  it('makes one call when Me answers, two only after a clean 401', async () => {
    const answers = [
      { kind: 'error', cause: 'unauthenticated' },
      { kind: 'error', cause: 'unauthenticated' },
    ] as const
    const fetchMe = vi.fn(async () => answers[fetchMe.mock.calls.length - 1])
    const { verdict } = await resolveSession(signedInRequest(), { fetchMe })
    expect(verdict).toEqual({ kind: 'signed-out', reason: 'rejected' })
    expect(fetchMe).toHaveBeenCalledTimes(2)

    const once = vi.fn(async () => ({ kind: 'user', user: { id: 'u' } }) as never)
    await resolveSession(signedInRequest(), { fetchMe: once })
    expect(once).toHaveBeenCalledTimes(1)
  })

  it(`aborts Me at SESSION_TIMEOUT_MS (${SESSION_TIMEOUT_MS} ms) and keeps the session`, async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const fetchMe = vi.fn((_request: Request, s: AbortSignal) => {
      signal = s
      return new Promise<never>(() => undefined)
    })
    const pending = resolveSession(signedInRequest(), { fetchMe })

    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS - 1)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const { verdict } = await pending
    expect(signal?.aborted).toBe(true)
    expect(verdict).toEqual({ kind: 'unknown', reason: 'timeout' })
    expect(fetchMe).toHaveBeenCalledTimes(1)
  })

  it('reads the outage memory after the calls, so an outage seen meanwhile counts', async () => {
    const fetchMe = vi.fn(async () => {
      recordApiOutage()
      return { kind: 'error', cause: 'unauthenticated' } as const
    })
    const { verdict } = await resolveSession(signedInRequest(), { fetchMe })
    expect(verdict).toEqual({ kind: 'unknown', reason: 'outage' })
  })

  it('never lets a fetchMe that throws decide by its message', async () => {
    const fetchMe = vi.fn(async () => {
      throw new Error('UNAUTHENTICATED Unauthorized 401')
    })
    const { verdict } = await resolveSession(signedInRequest(), { fetchMe })
    expect(verdict).toEqual({ kind: 'unknown', reason: 'answered-error' })
  })
})

describe('createSessionMiddleware', () => {
  it('skips the sessionless patterns (the web health check never calls the API)', async () => {
    expect(SESSIONLESS_PATTERNS.has('/healthz')).toBe(true)
    const fetchMe = vi.fn()
    const middleware = createSessionMiddleware({ fetchMe })
    const next = vi.fn(async () => new Response('ok'))
    await middleware(
      {
        request: signedInRequest(),
        context: new RouterContextProvider(),
        params: {},
        pattern: '/healthz',
      } as never,
      next,
    )
    expect(fetchMe).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('leaves a redirect alone on a rejected session (the sign-out route expires the cookie)', async () => {
    const middleware = createSessionMiddleware({
      fetchMe: async () => ({ kind: 'error', cause: 'unauthenticated' }),
    })
    const response = (await middleware(
      {
        request: signedInRequest(),
        context: new RouterContextProvider(),
        params: {},
        pattern: '/x',
      } as never,
      async () => new Response(null, { status: 302, headers: { Location: '/x' } }),
    )) as Response
    expect(response.headers.getSetCookie()).toEqual([])
  })
})

describe('sessionRejectedPath (owner decision D3)', () => {
  it.each([
    [undefined, '/force-logout'],
    ['', '/force-logout'],
    ['  ', '/force-logout'],
    ['/session-expired', '/session-expired'],
    [' /session-expired ', '/session-expired'],
    ['//evil.example', '/force-logout'],
    ['https://evil.example', '/force-logout'],
    ['/\\evil.example', '/force-logout'],
    ['session-expired', '/force-logout'],
  ])('%j -> %s', (value, path) => {
    expect(sessionRejectedPath(value)).toBe(path)
  })
})

describe('returnPath', () => {
  it.each([
    ['http://localhost/members', '/members'],
    ['http://localhost/members.data', '/members'],
    ['http://localhost/members?tab=a&_routes=root', '/members?tab=a'],
    ['http://localhost/members?index&_routes=routes%2Fmembers', '/members'],
    ['http://localhost/_root.data', '/'],
  ])('%s -> %s', (url, path) => {
    expect(returnPath(new URL(url))).toBe(path)
  })
})

describe('getSession / requireUser', () => {
  it('getSession names the missing middleware', () => {
    expect(() => getSession(new RouterContextProvider())).toThrow(/sessionMiddleware/)
  })

  it('requireUser is a programming error, not a sign-out, outside requireSession', () => {
    const context = new RouterContextProvider()
    context.set(sessionContext, { kind: 'unknown', reason: 'outage' })
    expect(() => requireUser(context)).toThrow(/requireUser called outside requireSession/)
    context.set(sessionContext, { kind: 'signed-in', user: { id: 'u' } as never })
    expect(requireUser(context)).toEqual({ id: 'u' })
  })
})
