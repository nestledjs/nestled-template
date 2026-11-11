import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { CombinedGraphQLErrors, gql, ServerError } from '@apollo/client'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  classifyApiFailure,
  isApiOutageSignalled,
  isRetryableConnectivityError,
  makeClient,
  signalApiOutage,
  subscriptionRetryDelayMs,
  takeDeferredAuthFailure,
} from './apollo'
import { apolloLoader, mergeApiFailureCauses, ssrApiFailureCause } from './apollo-loader'

function jwtWithIssuedAt(iat: number): string {
  const payload = Buffer.from(JSON.stringify({ iat })).toString('base64url')
  return `header.${payload}.signature`
}

// The base64url decoder these tests rely on lives in @nestled-template/shared/utils and is tested
// there, next to the cookie picker that shares it.

describe('makeClient', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalCookieName = process.env.VITE_COOKIE_NAME
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalCookieName === undefined) {
      delete process.env.VITE_COOKIE_NAME
    } else {
      process.env.VITE_COOKIE_NAME = originalCookieName
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
    localStorage.clear()
  })

  it('creates an SSR client with an explicit token and API url', () => {
    const client = makeClient(undefined, {
      token: 'token-123',
      apiUrl: 'https://api.example.com/graphql',
      environment: 'production',
    })

    expect(client).toBeTruthy()
    expect((client as any).link).toBeTruthy()
    expect((client as any).cache).toBeTruthy()
  })

  it('uses authorization headers before cookies and warns on development localhost fallback', () => {
    process.env.NODE_ENV = 'development'
    process.env.VITE_COOKIE_NAME = '__custom'
    const request = new Request('https://app.example.com', {
      headers: {
        authorization: 'Bearer header-token',
        cookie: `__custom=${jwtWithIssuedAt(10)}`,
      },
    })

    const client = makeClient(request, { environment: 'development' })

    expect(client).toBeTruthy()
    expect(console.warn).toHaveBeenCalledWith(
      '[Apollo makeClient] WARNING: No apiUrl provided, falling back to localhost:3000',
    )
  })

  it('chooses the newest JWT when duplicate session cookies exist', async () => {
    process.env.VITE_COOKIE_NAME = '__session'
    const older = jwtWithIssuedAt(1)
    const newer = jwtWithIssuedAt(2)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ping: 'pong' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock
    const request = new Request('https://app.example.com', {
      headers: {
        cookie: `__session=${older}; theme=dark; __session=${newer}`,
      },
    })

    const client = makeClient(request, { apiUrl: 'https://api.example.com/graphql' })

    await client.query({
      query: gql`
        query Ping {
          ping
        }
      `,
    })

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(`Bearer ${newer}`)
  })

  it('chooses the newest JWT from document.cookie without Buffer', async () => {
    // The browser bundle polyfills nothing, so decoding through Buffer threw a ReferenceError on
    // every token. The throw never surfaced -- pickNewestJwt's catch treats it as a malformed
    // token and falls back to the LAST cookie value, which is what this whole path exists to stop
    // relying on. document.cookie orders by path specificity, not by age, so `older` last is the
    // realistic hostile ordering. Buffer is removed from globalThis for the whole query (tokens are
    // built before it goes) and restored in `finally`, so the browser decoder is the one exercised.
    process.env.VITE_COOKIE_NAME = '__session'
    const older = jwtWithIssuedAt(1)
    const newer = jwtWithIssuedAt(2)
    const originalBuffer = globalThis.Buffer

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ping: 'pong' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock

    // Override the cookie getter rather than replacing `document`. jsdom cannot hold two cookies
    // of the same name, and swapping the whole object detaches the event target that later tests
    // in this file rely on.
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => `__session=${newer}; theme=dark; __session=${older}`,
    })

    try {
      Reflect.deleteProperty(globalThis, 'Buffer')
      expect(typeof Buffer).toBe('undefined')

      const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })

      await client.query({
        query: gql`
          query Ping {
            ping
          }
        `,
      })

      expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(`Bearer ${newer}`)
    } finally {
      globalThis.Buffer = originalBuffer
      Reflect.deleteProperty(document, 'cookie')
    }
  })

  it('keeps the raw session cookie when its value is not valid percent-encoding', async () => {
    // decodeURIComponent throws a URIError on a malformed `%` sequence. Unguarded, that throw
    // escaped makeClient and failed the whole loader; the server already falls back to the raw
    // value, and so does the client now.
    process.env.VITE_COOKIE_NAME = '__session'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ping: 'pong' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock
    const request = new Request('https://app.example.com', {
      headers: { cookie: 'other=%E0%A4%A; __session=abc%zz; theme=dark' },
    })

    const client = makeClient(request, { apiUrl: 'https://api.example.com/graphql' })

    await client.query({
      query: gql`
        query Ping {
          ping
        }
      `,
    })

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer abc%zz')
  })

  it('prefers the last duplicate JWT when both were issued in the same second', async () => {
    process.env.VITE_COOKIE_NAME = '__session'
    const first = jwtWithIssuedAt(1)
    const second = `${jwtWithIssuedAt(1)}-newer-signature`
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ping: 'pong' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock
    const request = new Request('https://app.example.com', {
      headers: {
        cookie: `__session=${first}; __session=${second}`,
      },
    })

    const client = makeClient(request, { apiUrl: 'https://api.example.com/graphql' })

    await client.query({
      query: gql`
        query Ping {
          ping
        }
      `,
    })

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(`Bearer ${second}`)
  })

  it('sends authorization and active organization headers through the link chain', async () => {
    localStorage.setItem('activeOrganizationId', 'org-123')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ping: 'pong' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock
    const client = makeClient(undefined, {
      token: 'token-123',
      apiUrl: 'https://api.example.com/graphql',
    })

    await expect(
      client.query({
        query: gql`
          query Ping {
            ping
          }
        `,
      }),
    ).resolves.toMatchObject({ data: { ping: 'pong' } })

    const [, requestInit] = fetchMock.mock.calls[0]
    expect(requestInit.headers.authorization).toBe('Bearer token-123')
    expect(requestInit.headers['x-organization-id']).toBe('org-123')
    expect(requestInit.headers['apollo-require-preflight']).toBe('true')
  })

  it('reports every request that fails without reaching the server', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent')
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
    const query = gql`
      query Ping {
        ping
      }
    `

    await expect(client.query({ query })).resolves.toMatchObject({
      error: expect.objectContaining({ message: 'Failed to fetch' }),
    })
    await expect(client.query({ query, fetchPolicy: 'network-only' })).resolves.toMatchObject({
      error: expect.objectContaining({ message: 'Failed to fetch' }),
    })

    expect(consoleError).toHaveBeenCalledWith(
      '[Apollo Error Link] Network error for operation: Ping',
    )
    // No 30-second latch: the web app de-duplicates while it confirms, and a latch here hid an
    // outage that began soon after a recovery.
    const reports = dispatchEvent.mock.calls.filter(
      ([event]) => event.type === APOLLO_SERVICE_UNAVAILABLE_EVENT,
    )
    expect(reports).toHaveLength(2)
  })

  it.each([
    ['Safari', new TypeError('Load failed')],
    ['Firefox', new TypeError('NetworkError when attempting to fetch resource.')],
    ['Node', new TypeError('fetch failed')],
  ])('reports a %s fetch failure', async (_browser, failure) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent')
    globalThis.fetch = vi.fn().mockRejectedValue(failure)
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })

    await client.query({
      query: gql`
        query Ping {
          ping
        }
      `,
    })

    expect(
      dispatchEvent.mock.calls.filter(([event]) => event.type === APOLLO_SERVICE_UNAVAILABLE_EVENT),
    ).toHaveLength(1)
  })

  it('reports a gateway 503 but not an ordinary TypeError or a 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent')
    const query = gql`
      query Ping {
        ping
      }
    `
    const reports = () =>
      dispatchEvent.mock.calls.filter(([event]) => event.type === APOLLO_SERVICE_UNAVAILABLE_EVENT)

    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'x')"))
    await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
    expect(reports()).toHaveLength(0)

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('boom', { status: 500, headers: { 'content-type': 'text/plain' } }),
      )
    await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
    expect(reports()).toHaveLength(0)

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('Bad gateway', { status: 503, headers: { 'content-type': 'text/html' } }),
      )
    await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
    expect(reports()).toHaveLength(1)
  })

  it('redirects through logout when a transport response is unauthorized', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const testWindow = {
      location: {
        pathname: '/admin/sessions',
        search: '?view=active',
        hash: '#recent',
        href: '',
      },
    }
    vi.stubGlobal('window', testWindow)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })

    await client.query({
      query: gql`
        query PrivateData {
          privateData
        }
      `,
    })

    expect(consoleLog).toHaveBeenCalledWith(
      '[Apollo] Authentication error detected, redirecting to logout then login',
    )
    expect(consoleError).toHaveBeenCalled()
    expect(testWindow.location.href).toBe(
      '/logout?return_url=%2Fadmin%2Fsessions%3Fview%3Dactive%23recent',
    )
  })

  it('keeps the session on a 401 while an outage is signalled, and logs out once it clears', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const testWindow = { location: { pathname: '/members', search: '', hash: '', href: '' } }
    vi.stubGlobal('window', testWindow)
    globalThis.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const query = gql`
      query PrivateData {
        privateData
      }
    `
    const first = {}
    const second = {}
    try {
      signalApiOutage(first, true)
      signalApiOutage(second, true)
      expect(isApiOutageSignalled()).toBe(true)
      expect(takeDeferredAuthFailure()).toBe(false)
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
      expect(testWindow.location.href).toBe('')
      expect(consoleLog).toHaveBeenCalledWith(
        '[Apollo] Authentication error during an API outage, keeping the session for now',
      )
      // Recorded once, for the app to refetch the query after the outage, then cleared.
      expect(takeDeferredAuthFailure()).toBe(true)
      expect(takeDeferredAuthFailure()).toBe(false)

      // One source clearing does not clear another's evidence.
      signalApiOutage(first, false)
      expect(isApiOutageSignalled()).toBe(true)
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
      expect(testWindow.location.href).toBe('')
      expect(takeDeferredAuthFailure()).toBe(true)

      signalApiOutage(second, false)
      expect(isApiOutageSignalled()).toBe(false)
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
      expect(testWindow.location.href).toBe('/logout?return_url=%2Fmembers')
      expect(takeDeferredAuthFailure()).toBe(false)
    } finally {
      takeDeferredAuthFailure()
      signalApiOutage(first, false)
      signalApiOutage(second, false)
    }
  })

  it('signals a friendly access-denied state for forbidden queries', async () => {
    const forbiddenHandler = vi.fn()
    globalThis.addEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, forbiddenHandler)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            {
              message: 'Forbidden',
              extensions: { code: 'FORBIDDEN' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })

    await client.query({
      query: gql`
        query PrivateData {
          privateData
        }
      `,
    })

    expect(forbiddenHandler).toHaveBeenCalledTimes(1)
    globalThis.removeEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, forbiddenHandler)
  })

  it('leaves forbidden mutations with the invoking UI', async () => {
    const forbiddenHandler = vi.fn()
    globalThis.addEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, forbiddenHandler)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            {
              message: 'Forbidden',
              extensions: { code: 'FORBIDDEN' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })

    await client.mutate({
      mutation: gql`
        mutation UpdatePrivateData {
          updatePrivateData
        }
      `,
    })

    expect(forbiddenHandler).not.toHaveBeenCalled()
    globalThis.removeEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, forbiddenHandler)
  })
})

describe('subscriptionRetryDelayMs', () => {
  it('backs off from 2 s to a 30 s cap', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(retries => subscriptionRetryDelayMs(retries, 0))).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ])
  })

  it('adds under a second of jitter', () => {
    expect(subscriptionRetryDelayMs(0, 0.999)).toBe(2999)
  })

  it('draws the default jitter from the platform CSPRNG', () => {
    const delay = subscriptionRetryDelayMs(0)
    expect(delay).toBeGreaterThanOrEqual(2000)
    expect(delay).toBeLessThan(3000)
  })
})

describe('isRetryableConnectivityError', () => {
  function serverError(status: number) {
    return new ServerError('Response not successful', {
      response: new Response(null, { status }),
      bodyText: '',
    })
  }

  it.each([
    ['a Chromium fetch failure', new TypeError('Failed to fetch')],
    ['a Safari fetch failure', new TypeError('Load failed')],
    ['a refused connection', new Error('connect ECONNREFUSED 127.0.0.1:3000')],
    ['a proxy 502', serverError(502)],
    ['a proxy 503', serverError(503)],
    ['a proxy 504', serverError(504)],
  ])('retries %s', (_label, error) => {
    expect(isRetryableConnectivityError(error)).toBe(true)
  })

  it.each([
    ['an HTTP 401', serverError(401)],
    ['an HTTP 403', serverError(403)],
    ['an HTTP 400', serverError(400)],
    ['an HTTP 500', serverError(500)],
    [
      'a TypeError from application code',
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    ],
    ['a GraphQL error', new CombinedGraphQLErrors({ errors: [{ message: 'Failed to fetch' }] })],
    ['a non-error value', 'Failed to fetch'],
    ['undefined', undefined],
  ])('does not retry %s', (_label, error) => {
    expect(isRetryableConnectivityError(error)).toBe(false)
  })
})

describe('classifyApiFailure', () => {
  function serverError(status: number) {
    return new ServerError('Response not successful', {
      response: new Response(null, { status }),
      bodyText: '',
    })
  }

  it.each([
    ['an HTTP 401', serverError(401), 'unauthenticated'],
    [
      'an UNAUTHENTICATED GraphQL error',
      new CombinedGraphQLErrors({
        errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
      }),
      'unauthenticated',
    ],
    ['no response at all', new TypeError('Failed to fetch'), 'unavailable'],
    ['a proxy 502', serverError(502), 'unavailable'],
    ['a proxy 503', serverError(503), 'unavailable'],
    ['a proxy 504', serverError(504), 'unavailable'],
    ['an HTTP 403', serverError(403), 'other'],
    ['an HTTP 500', serverError(500), 'other'],
    [
      'a FORBIDDEN GraphQL error',
      new CombinedGraphQLErrors({ errors: [{ message: 'No', extensions: { code: 'FORBIDDEN' } }] }),
      'other',
    ],
    ['an application TypeError', new TypeError('Cannot read properties of undefined'), 'other'],
  ] as const)('classifies %s as %s', (_label, error, cause) => {
    expect(classifyApiFailure(error)).toBe(cause)
  })

  it('tells onApiFailure what each failed operation failed with', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const query = gql`
      query Me {
        me {
          id
        }
      }
    `
    const causes: string[] = []
    const onApiFailure = (cause: string) => causes.push(cause)
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql', onApiFailure })
        .query({ query })
        .catch(() => undefined)
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql', onApiFailure })
        .query({ query })
        .catch(() => undefined)
    } finally {
      globalThis.fetch = originalFetch
      vi.restoreAllMocks()
    }
    expect(causes).toEqual(['unavailable', 'unauthenticated'])
  })
})

describe('apolloLoader failure record', () => {
  function loaderArgs() {
    return {
      request: new Request('https://app.example.com/members'),
      params: {},
      context: {},
    } as never
  }

  it('attaches a record to plain loader data, and finds no cause while nothing failed', () => {
    const data = apolloLoader()(() => ({ theme: 'dark' }))(loaderArgs())

    expect(Object.keys(data)).toEqual(['theme'])
    expect(JSON.stringify(data)).toBe('{"theme":"dark"}')
    expect(ssrApiFailureCause({ root: data })).toBeUndefined()
  })

  it('accepts frozen and non-extensible loader data without mutating it', () => {
    const frozen = Object.freeze({ theme: 'dark' })
    const sealed = Object.preventExtensions({ theme: 'light' })

    expect(apolloLoader()(() => frozen)(loaderArgs())).toBe(frozen)
    expect(apolloLoader()(() => sealed)(loaderArgs())).toBe(sealed)
    expect(Object.getOwnPropertySymbols(frozen)).toEqual([])
    expect(Object.getOwnPropertySymbols(sealed)).toEqual([])
    expect(ssrApiFailureCause({ root: frozen, child: sealed })).toBeUndefined()
  })

  it('passes a Response through untouched', () => {
    const redirect = new Response(null, { status: 302 })
    expect(apolloLoader()(() => redirect)(loaderArgs())).toBe(redirect)
    expect(ssrApiFailureCause({ root: redirect })).toBeUndefined()
  })

  it('reports the cause the loader client recorded, an outage outranking a 401', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const originalFetch = globalThis.fetch
    const query = gql`
      query Me {
        me {
          id
        }
      }
    `
    try {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      const unavailable = await apolloLoader()(async ({ preloadQuery }) => {
        const ref = preloadQuery(query)
        await new Promise(resolve => setTimeout(resolve, 20))
        return { ref }
      })(loaderArgs())
      expect(ssrApiFailureCause({ root: unavailable })).toBe('unavailable')

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      // Frozen loader data still carries its record.
      const rejected = await apolloLoader()(async ({ preloadQuery }) => {
        const ref = preloadQuery(query)
        await new Promise(resolve => setTimeout(resolve, 20))
        return Object.freeze({ ref })
      })(loaderArgs())
      expect(ssrApiFailureCause({ root: rejected })).toBe('unauthenticated')
      // A 401 in one loader and an outage in another: the request is an outage, not a sign-out.
      expect(ssrApiFailureCause({ root: unavailable, child: rejected })).toBe('unavailable')
      expect(ssrApiFailureCause({ root: rejected, child: unavailable })).toBe('unavailable')
    } finally {
      globalThis.fetch = originalFetch
      vi.restoreAllMocks()
    }
  })

  it('records a 401 and an outage in the same loader as an outage, in either order', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const originalFetch = globalThis.fetch
    const me = gql`
      query Me {
        me {
          id
        }
      }
    `
    const settings = gql`
      query Settings {
        settings {
          id
        }
      }
    `
    const unauthorized = () =>
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    const operationName = (init?: RequestInit) =>
      (JSON.parse(String(init?.body ?? '{}')) as { operationName?: string }).operationName
    try {
      for (const unreachable of ['Me', 'Settings']) {
        globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
          if (operationName(init) === unreachable) throw new TypeError('Failed to fetch')
          return unauthorized()
        }) as typeof fetch
        const data = await apolloLoader()(async ({ preloadQuery }) => {
          const meRef = preloadQuery(me)
          const settingsRef = preloadQuery(settings)
          await new Promise(resolve => setTimeout(resolve, 20))
          return { meRef, settingsRef }
        })(loaderArgs())
        expect(ssrApiFailureCause({ root: data })).toBe('unavailable')
      }
    } finally {
      globalThis.fetch = originalFetch
      vi.restoreAllMocks()
    }
  })
})

describe('mergeApiFailureCauses', () => {
  it.each([
    [undefined, undefined, undefined],
    [undefined, 'other', 'other'],
    ['unauthenticated', undefined, 'unauthenticated'],
    ['other', 'unauthenticated', 'unauthenticated'],
    ['unauthenticated', 'other', 'unauthenticated'],
    ['unauthenticated', 'unavailable', 'unavailable'],
    ['unavailable', 'unauthenticated', 'unavailable'],
    ['other', 'unavailable', 'unavailable'],
  ] as const)('%s + %s -> %s', (a, b, merged) => {
    expect(mergeApiFailureCauses(a, b)).toBe(merged)
  })
})
