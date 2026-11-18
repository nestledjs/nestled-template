import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  ApolloLink,
  CombinedGraphQLErrors,
  execute,
  gql,
  Observable,
  ServerError,
  type ApolloClient,
} from '@apollo/client'
import { RetryLink } from '@apollo/client/link/retry'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_DEFERRED_AUTH_FAILURE_EVENT,
  APOLLO_ORGANIZATION_REQUIRED_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  activeOrganizationSession,
  classifyApiFailure,
  clearApiOutage,
  createOutageRetryLink,
  getStoredActiveOrganizationId,
  isApiOutageSignalled,
  isActiveOrganizationAmbiguous,
  isAuthFailureDeferred,
  isOrganizationContextRequiredError,
  isQueryOperation,
  isRetryableConnectivityError,
  makeClient,
  ORGANIZATION_CONTEXT_REQUIRED_CODE,
  resolveActiveOrganization,
  signalApiOutage,
  SKIP_AUTH_ERROR_REPORT_CONTEXT,
  storeActiveOrganizationId,
  subscriptionRetryDelayMs,
  takeDeferredAuthFailure,
} from './apollo'
import {
  apolloLoader,
  mergeApiFailureCauses,
  ssrApiFailureCause,
  ssrOrganizationRequired,
  waitForSsrApiCalls,
} from './apollo-loader'

function jwtWithIssuedAt(iat: number): string {
  const payload = Buffer.from(JSON.stringify({ iat })).toString('base64url')
  return `header.${payload}.signature`
}

/**
 * The API's answer when it cannot complete a request (a `ServiceUnavailableException`, thrown when
 * the API-token lookup fails): HTTP 200, `INTERNAL_SERVER_ERROR` with `extensions.status: 503`, as
 * libs/api/utils' formatApiError spec shows over the real pipeline.
 */
const GRAPHQL_503_ERROR = {
  message: 'API token validation is temporarily unavailable',
  extensions: {
    code: 'INTERNAL_SERVER_ERROR',
    status: 503,
    originalError: {
      message: 'API token validation is temporarily unavailable',
      error: 'Service Unavailable',
      statusCode: 503,
    },
  },
}

function graphQL503(): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({ errors: [GRAPHQL_503_ERROR] })
}

/** An INTERNAL_SERVER_ERROR with `extensions.status` and/or the original exception's status. */
function graphQLWithStatus(
  status: number | undefined,
  originalStatus?: number,
): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Something failed',
        extensions: {
          code: 'INTERNAL_SERVER_ERROR',
          ...(status === undefined ? {} : { status }),
          ...(originalStatus === undefined
            ? {}
            : { originalError: { statusCode: originalStatus } }),
        },
      },
    ],
  })
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

  describe('errorPolicy defaults', () => {
    const refusal = () =>
      new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: 'That name is taken', extensions: { code: 'BAD_USER_INPUT' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )

    it('rejects a mutation the API refuses, with the API message', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      globalThis.fetch = vi.fn().mockResolvedValue(refusal())
      const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      const mutation = gql`
        mutation Rename {
          rename
        }
      `

      const outcome = client.mutate({ mutation })

      await expect(outcome).rejects.toBeInstanceOf(CombinedGraphQLErrors)
      await expect(outcome).rejects.toThrow('That name is taken')
    })

    it('still resolves a query with its GraphQL error (queries keep errorPolicy all)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      globalThis.fetch = vi.fn().mockResolvedValue(refusal())
      const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      const query = gql`
        query Name {
          name
        }
      `

      const { error } = await client.query({ query, fetchPolicy: 'no-cache' })

      expect(error).toBeInstanceOf(CombinedGraphQLErrors)
      expect(error?.message).toContain('That name is taken')
    })
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

  describe('a GraphQL 503 (HTTP 200, INTERNAL_SERVER_ERROR, extensions.status 503)', () => {
    const graphQLAnswer = (errors: unknown[]) =>
      new Response(JSON.stringify({ data: null, errors }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const query = gql`
      query Ping {
        ping
      }
    `

    afterEach(() => {
      takeDeferredAuthFailure()
    })

    it('is reported as an outage, and a plain INTERNAL_SERVER_ERROR is not', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const dispatchEvent = vi.spyOn(window, 'dispatchEvent')
      const reports = () =>
        dispatchEvent.mock.calls.filter(
          ([event]) => event.type === APOLLO_SERVICE_UNAVAILABLE_EVENT,
        )

      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          graphQLAnswer([
            { message: 'boom', extensions: { code: 'INTERNAL_SERVER_ERROR', status: 500 } },
          ]),
        )
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
      expect(reports()).toHaveLength(0)

      globalThis.fetch = vi.fn().mockResolvedValue(graphQLAnswer([GRAPHQL_503_ERROR]))
      const { error } = await makeClient(undefined, {
        apiUrl: 'https://api.example.com/graphql',
      }).query({ query })
      expect(reports()).toHaveLength(1)
      // And the failed query is one the app refetches once the API answers.
      expect(isRetryableConnectivityError(error)).toBe(true)
    })

    it('keeps the session over an UNAUTHENTICATED error in the same answer', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const testWindow = {
        location: { pathname: '/members', search: '', hash: '', href: '' },
        dispatchEvent: vi.fn(),
      }
      vi.stubGlobal('window', testWindow)
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          graphQLAnswer([
            { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
            GRAPHQL_503_ERROR,
          ]),
        )

      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })

      expect(testWindow.location.href).toBe('')
      // Let pass like any 401 during an outage: refetched for a fresh answer once it clears.
      expect(takeDeferredAuthFailure()).toBe(true)
    })
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

  it('keeps the session on a GraphQL error that only says "Unauthorized", with no code', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const testWindow = { location: { pathname: '/members', search: '', hash: '', href: '' } }
    vi.stubGlobal('window', testWindow)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: 'Unauthorized' }, { message: 'Session has been invalidated.' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      .query({
        query: gql`
          query PrivateData {
            privateData
          }
        `,
      })
      .catch(() => undefined)

    expect(testWindow.location.href).toBe('')
  })

  describe('a 401 while a retry of an unreachable call is still in flight', () => {
    const FLAKY = gql`
      query Flaky {
        flaky
      }
    `
    const ME = gql`
      query Me {
        me {
          id
        }
      }
    `
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    function setUp(flakyAttempts: Array<() => Promise<Response>>) {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const testWindow = {
        location: { pathname: '/members', search: '', hash: '', href: '' },
        dispatchEvent: vi.fn(),
      }
      vi.stubGlobal('window', testWindow)
      let flakyCalls = 0
      globalThis.fetch = vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
        const { operationName } = JSON.parse(String(init?.body))
        if (operationName === 'Me') return json(401, { message: 'Unauthorized' })
        const attempt = flakyAttempts[Math.min(flakyCalls, flakyAttempts.length - 1)]
        flakyCalls += 1
        return attempt()
      })
      const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      const run = (query: typeof ME) =>
        client.query({ query, fetchPolicy: 'network-only' }).catch(() => undefined)
      return { testWindow, run }
    }

    afterEach(() => {
      takeDeferredAuthFailure()
    })

    it('keeps the session until the retry settles, then logs out on a clean 401', async () => {
      let answerRetry: () => void = () => undefined
      const { testWindow, run } = setUp([
        () => Promise.reject(new TypeError('Failed to fetch')),
        () =>
          new Promise<Response>(resolve => {
            answerRetry = () => resolve(json(200, { data: { flaky: 'ok' } }))
          }),
      ])
      await run(FLAKY)

      const retry = run(FLAKY)
      await vi.waitFor(() => expect(isApiOutageSignalled()).toBe(true))
      await run(ME)

      // The 401 came back while the unreachable call was still being retried: kept.
      expect(testWindow.location.href).toBe('')
      expect(takeDeferredAuthFailure()).toBe(true)

      answerRetry()
      await retry
      expect(isApiOutageSignalled()).toBe(false)

      await run(ME)
      expect(testWindow.location.href).toBe('/logout?return_url=%2Fmembers')
    })

    it('counts the retry of a query answered with a GraphQL 503 as outage evidence', async () => {
      let answerRetry: () => void = () => undefined
      const { testWindow, run } = setUp([
        () => Promise.resolve(json(200, { data: null, errors: [GRAPHQL_503_ERROR] })),
        () =>
          new Promise<Response>(resolve => {
            answerRetry = () => resolve(json(200, { data: { flaky: 'ok' } }))
          }),
      ])
      await run(FLAKY)

      const retry = run(FLAKY)
      await vi.waitFor(() => expect(isApiOutageSignalled()).toBe(true))
      await run(ME)

      // The concurrent 401 is kept, as it is beside a proxy's 503.
      expect(testWindow.location.href).toBe('')
      expect(takeDeferredAuthFailure()).toBe(true)

      answerRetry()
      await retry
      expect(isApiOutageSignalled()).toBe(false)
    })

    it('announces the end of the evidence when a 401 was let pass meanwhile', async () => {
      let answerRetry: () => void = () => undefined
      const { testWindow, run } = setUp([
        () => Promise.reject(new TypeError('Failed to fetch')),
        () =>
          new Promise<Response>(resolve => {
            answerRetry = () => resolve(json(200, { data: { flaky: 'ok' } }))
          }),
      ])
      const announced = () =>
        testWindow.dispatchEvent.mock.calls.filter(
          ([event]) => (event as Event).type === APOLLO_DEFERRED_AUTH_FAILURE_EVENT,
        )
      await run(FLAKY)
      const retry = run(FLAKY)
      await vi.waitFor(() => expect(isApiOutageSignalled()).toBe(true))
      await run(ME)
      expect(announced()).toHaveLength(0)

      answerRetry()
      await retry

      // Nothing else would tell the app to refetch the query left holding the deferred 401.
      expect(announced()).toHaveLength(1)
    })

    it('does not announce anything when no 401 was let pass', async () => {
      const { testWindow, run } = setUp([
        () => Promise.reject(new TypeError('Failed to fetch')),
        async () => json(200, { data: { flaky: 'ok' } }),
      ])
      await run(FLAKY)
      await run(FLAKY)

      expect(
        testWindow.dispatchEvent.mock.calls.filter(
          ([event]) => (event as Event).type === APOLLO_DEFERRED_AUTH_FAILURE_EVENT,
        ),
      ).toHaveLength(0)
    })

    it('logs out when the retry itself is answered 200 with an UNAUTHENTICATED error', async () => {
      const { testWindow, run } = setUp([
        () => Promise.reject(new TypeError('Failed to fetch')),
        async () =>
          json(200, {
            data: null,
            errors: [{ message: 'Expired', extensions: { code: 'UNAUTHENTICATED' } }],
          }),
      ])
      await run(FLAKY)

      await run(FLAKY)

      expect(isApiOutageSignalled()).toBe(false)
      expect(testWindow.location.href).toBe('/logout?return_url=%2Fmembers')
    })

    it('does not count a call that never failed to reach the API', async () => {
      let answerFirst: () => void = () => undefined
      const { testWindow, run } = setUp([
        () =>
          new Promise<Response>(resolve => {
            answerFirst = () => resolve(json(200, { data: { flaky: 'ok' } }))
          }),
      ])

      const inFlight = run(FLAKY)
      await run(ME)

      expect(testWindow.location.href).toBe('/logout?return_url=%2Fmembers')
      answerFirst()
      await inFlight
    })

    it("judges a retried call's own 401 like any other", async () => {
      const { testWindow, run } = setUp([
        () => Promise.reject(new TypeError('Failed to fetch')),
        async () => json(401, { message: 'Unauthorized' }),
      ])
      await run(FLAKY)

      await run(FLAKY)

      expect(isApiOutageSignalled()).toBe(false)
      expect(testWindow.location.href).toBe('/logout?return_url=%2Fmembers')
    })
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
      signalApiOutage(first)
      signalApiOutage(second)
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
      clearApiOutage(first)
      expect(isApiOutageSignalled()).toBe(true)
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
      expect(testWindow.location.href).toBe('')
      expect(takeDeferredAuthFailure()).toBe(true)

      clearApiOutage(second)
      expect(isApiOutageSignalled()).toBe(false)
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({ query })
      expect(testWindow.location.href).toBe('/logout?return_url=%2Fmembers')
      expect(takeDeferredAuthFailure()).toBe(false)
    } finally {
      takeDeferredAuthFailure()
      clearApiOutage(first)
      clearApiOutage(second)
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

    // The refusal goes back to the caller (it rejects under the 'none' mutation default).
    await expect(
      client.mutate({
        mutation: gql`
          mutation UpdatePrivateData {
            updatePrivateData
          }
        `,
      }),
    ).rejects.toThrow('Forbidden')

    expect(forbiddenHandler).not.toHaveBeenCalled()
    globalThis.removeEventListener(APOLLO_ACCESS_FORBIDDEN_EVENT, forbiddenHandler)
  })

  describe('a 403 with its own code', () => {
    function answerWith(code: string) {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: null,
            errors: [
              {
                message: 'Refused',
                extensions: { code, originalError: { statusCode: 403, code } },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    }

    async function queryAsSignedInUser() {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const dispatchEvent = vi.fn()
      const testWindow = {
        location: { pathname: '/settings/members', search: '', hash: '', href: '' },
        dispatchEvent,
      }
      vi.stubGlobal('window', testWindow)
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' }).query({
        query: gql`
          query CurrentSubscriptionActive {
            currentSubscriptionActive
          }
        `,
      })
      return { testWindow, dispatchEvent }
    }

    it('keeps the session and sends ORGANIZATION_CONTEXT_REQUIRED to the organization picker', async () => {
      answerWith(ORGANIZATION_CONTEXT_REQUIRED_CODE)

      const { testWindow, dispatchEvent } = await queryAsSignedInUser()

      expect(testWindow.location.href).toBe('')
      expect(dispatchEvent).toHaveBeenCalledTimes(1)
      expect(dispatchEvent.mock.calls[0][0].type).toBe(APOLLO_ORGANIZATION_REQUIRED_EVENT)
    })

    it('leaves a mutation refused with ORGANIZATION_CONTEXT_REQUIRED to the invoking UI', async () => {
      answerWith(ORGANIZATION_CONTEXT_REQUIRED_CODE)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const dispatchEvent = vi.fn()
      const testWindow = {
        location: { pathname: '/settings/members', search: '', hash: '', href: '' },
        dispatchEvent,
      }
      vi.stubGlobal('window', testWindow)

      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
        .mutate({
          mutation: gql`
            mutation CancelSubscription {
              cancelSubscription
            }
          `,
        })
        .catch(() => undefined)

      expect(testWindow.location.href).toBe('')
      expect(dispatchEvent).not.toHaveBeenCalled()
    })

    it('treats any other coded 403 as access denied, never a logout', async () => {
      answerWith('PLAN_LIMIT_REACHED')

      const { testWindow, dispatchEvent } = await queryAsSignedInUser()

      expect(testWindow.location.href).toBe('')
      expect(dispatchEvent).toHaveBeenCalledTimes(1)
      expect(dispatchEvent.mock.calls[0][0].type).toBe(APOLLO_ACCESS_FORBIDDEN_EVENT)
    })
  })
})

describe('isQueryOperation', () => {
  const operation = (source: string) => ({ query: gql(source) }) as unknown as ApolloLink.Operation

  it('is true for a query only', () => {
    expect(isQueryOperation(operation('query Q { a }'))).toBe(true)
    expect(isQueryOperation(operation('mutation M { a }'))).toBe(false)
    expect(isQueryOperation(operation('subscription S { a }'))).toBe(false)
  })
})

describe('isAuthFailureDeferred', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    takeDeferredAuthFailure()
  })

  it('reports a 401 let pass during an outage without taking it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '', href: '' } })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 401 })),
    )
    const outage = {}
    signalApiOutage(outage)
    try {
      expect(isAuthFailureDeferred()).toBe(false)
      await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
        .query({ query: gql('query Q { a }') })
        .catch(() => undefined)

      expect(isAuthFailureDeferred()).toBe(true)
      expect(isAuthFailureDeferred()).toBe(true)
      expect(takeDeferredAuthFailure()).toBe(true)
      expect(isAuthFailureDeferred()).toBe(false)
    } finally {
      clearApiOutage(outage)
    }
  })
})

describe('createOutageRetryLink with a RetryLink above it', () => {
  // The placement an app with its own RetryLink uses: error link, RetryLink, this link, transport.
  // Each attempt the RetryLink makes passes through the outage link, so the attempt after one that
  // could not reach the API counts as outage evidence while it is in flight.
  let releaseSecondAttempt: () => void = () => undefined

  function chain(options?: Parameters<typeof createOutageRetryLink>[0]) {
    let attempts = 0
    const transport = new ApolloLink(
      () =>
        new Observable<ApolloLink.Result>(observer => {
          attempts += 1
          if (attempts === 1) {
            observer.error(new TypeError('Failed to fetch'))
            return
          }
          releaseSecondAttempt = () => {
            observer.next({ data: { saved: true } })
            observer.complete()
          }
        }),
    )
    const retry = new RetryLink({
      delay: { initial: 1, max: 1, jitter: false },
      attempts: { max: 2, retryIf: error => isRetryableConnectivityError(error) },
    })
    return ApolloLink.from([retry, createOutageRetryLink(options), transport])
  }

  function run(link: ApolloLink, source: string) {
    const client = { queryDeduplication: false } as unknown as ApolloClient
    return new Promise<void>((resolve, reject) => {
      execute(link, { query: gql(source) }, { client }).subscribe({
        complete: resolve,
        error: reject,
      })
    })
  }

  beforeEach(() => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  })

  afterEach(() => {
    releaseSecondAttempt()
    vi.unstubAllGlobals()
  })

  it("counts a query's retry as outage evidence while it is in flight", async () => {
    const done = run(chain(), 'query Saved { saved }')
    await vi.waitFor(() => expect(isApiOutageSignalled()).toBe(true))

    releaseSecondAttempt()
    await done
    expect(isApiOutageSignalled()).toBe(false)
  })

  it('counts a retried mutation only when told to', async () => {
    const notCounted = run(chain(), 'mutation SaveA { saved }')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(isApiOutageSignalled()).toBe(false)
    releaseSecondAttempt()
    await notCounted

    const counted = run(chain({ counts: () => true }), 'mutation SaveB { saved }')
    await vi.waitFor(() => expect(isApiOutageSignalled()).toBe(true))
    releaseSecondAttempt()
    await counted
    expect(isApiOutageSignalled()).toBe(false)
  })
})

describe('cancelling a request through the link chain', () => {
  // A cancelled request must not leave outage evidence behind: every link passes the
  // unsubscription down to the transport, which aborts the fetch.
  const FLAKY = gql`
    query Flaky {
      flaky
    }
  `
  const signals: AbortSignal[] = []
  let calls = 0

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('window', {
      location: { pathname: '/', search: '', hash: '', href: '' },
      dispatchEvent: vi.fn(),
    })
    signals.length = 0
    calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: unknown, init?: RequestInit) => {
        calls += 1
        const signal = init?.signal as AbortSignal
        signals.push(signal)
        if (calls === 1) return Promise.reject(new TypeError('Failed to fetch'))
        // A hanging request, as to an API that is down; rejects like fetch when aborted.
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('This operation was aborted', 'AbortError')),
          )
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function retryInFlight() {
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
    await client.query({ query: FLAKY, fetchPolicy: 'network-only' }).catch(() => undefined)
    return client
  }

  it('withdraws the evidence and aborts the fetch when the query is unsubscribed', async () => {
    const client = await retryInFlight()
    const subscription = client
      .watchQuery({ query: FLAKY, fetchPolicy: 'network-only' })
      .subscribe(() => undefined)
    await vi.waitFor(() => expect(calls).toBe(2))
    expect(isApiOutageSignalled()).toBe(true)

    subscription.unsubscribe()

    await vi.waitFor(() => expect(signals[1].aborted).toBe(true))
    expect(isApiOutageSignalled()).toBe(false)
  })

  it('leaves no evidence behind when the caller aborts the request', async () => {
    const client = await retryInFlight()
    const controller = new AbortController()
    const aborted = client.query({
      query: FLAKY,
      fetchPolicy: 'network-only',
      context: { fetchOptions: { signal: controller.signal } },
    })
    await vi.waitFor(() => expect(calls).toBe(2))
    expect(isApiOutageSignalled()).toBe(true)

    controller.abort()
    await aborted.catch(() => undefined)

    expect(isApiOutageSignalled()).toBe(false)
    // The aborted attempt was not an outage either: the next one is not counted as a retry.
    void client.query({ query: FLAKY, fetchPolicy: 'network-only' }).catch(() => undefined)
    await vi.waitFor(() => expect(calls).toBe(3))
    expect(isApiOutageSignalled()).toBe(false)
  })
})

describe('signalApiOutage / clearApiOutage', () => {
  it('signals per source, and clearing one source keeps the others', () => {
    const first = {}
    const second = {}
    try {
      expect(isApiOutageSignalled()).toBe(false)
      signalApiOutage(first)
      signalApiOutage(first)
      signalApiOutage(second)
      expect(isApiOutageSignalled()).toBe(true)

      clearApiOutage(first)
      expect(isApiOutageSignalled()).toBe(true)
      clearApiOutage(second)
      expect(isApiOutageSignalled()).toBe(false)
      // Clearing a source that signalled nothing is harmless.
      clearApiOutage({})
      expect(isApiOutageSignalled()).toBe(false)
    } finally {
      clearApiOutage(first)
      clearApiOutage(second)
    }
  })

  it('takes the source alone: no boolean flag (Sonar S2301)', () => {
    expect(signalApiOutage).toHaveLength(1)
    expect(clearApiOutage).toHaveLength(1)
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
    ['a GraphQL 503 (the API could not complete a lookup)', graphQL503()],
    ['a GraphQL error whose original exception was a 502', graphQLWithStatus(undefined, 502)],
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
    ['a plain INTERNAL_SERVER_ERROR (a 500)', graphQLWithStatus(500)],
    ['an INTERNAL_SERVER_ERROR with no status', graphQLWithStatus(undefined)],
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
    ['a GraphQL 503', graphQL503(), 'unavailable'],
    [
      'a GraphQL error whose original exception was a 504',
      graphQLWithStatus(undefined, 504),
      'unavailable',
    ],
    [
      'a GraphQL 503 beside an UNAUTHENTICATED error in the same answer',
      new CombinedGraphQLErrors({
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
          GRAPHQL_503_ERROR,
        ],
      }),
      'unavailable',
    ],
    ['a plain INTERNAL_SERVER_ERROR (a 500)', graphQLWithStatus(500), 'other'],
    ['an INTERNAL_SERVER_ERROR with no status', graphQLWithStatus(undefined), 'other'],
    ['an HTTP 403', serverError(403), 'other'],
    ['an HTTP 500', serverError(500), 'other'],
    [
      'a FORBIDDEN GraphQL error',
      new CombinedGraphQLErrors({ errors: [{ message: 'No', extensions: { code: 'FORBIDDEN' } }] }),
      'other',
    ],
    [
      'an ORGANIZATION_CONTEXT_REQUIRED GraphQL error',
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Organization context required.',
            extensions: {
              code: 'ORGANIZATION_CONTEXT_REQUIRED',
              originalError: { statusCode: 403 },
            },
          },
        ],
      }),
      'other',
    ],
    ['an application TypeError', new TypeError('Cannot read properties of undefined'), 'other'],
    // Message text is never evidence of a dead session: only the status or the code.
    ...[
      'Unauthorized',
      'User from token not found or invalid.',
      'Invalid JWT payload.',
      'Session has been invalidated.',
      'Request failed with status 401',
    ].map(
      message =>
        [
          `a GraphQL error that only says "${message}"`,
          new CombinedGraphQLErrors({ errors: [{ message }] }),
          'other',
        ] as const,
    ),
    ['an Error that only says "Unauthorized"', new Error('Unauthorized'), 'other'],
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
    const errors: unknown[] = []
    const onApiFailure = (cause: string, error: unknown) => {
      causes.push(cause)
      errors.push(error)
    }
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
    // And the error itself, for what the cause does not say (an organization refusal's code).
    expect(errors).toHaveLength(2)
    expect(classifyApiFailure(errors[1])).toBe('unauthenticated')
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

  it('records a GraphQL 503 beside a concurrent 401 as an outage, and a plain 500 as other', async () => {
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
    const answer = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    const operationName = (init?: RequestInit) =>
      (JSON.parse(String(init?.body ?? '{}')) as { operationName?: string }).operationName
    const load = async () =>
      apolloLoader()(async ({ preloadQuery }) => {
        const meRef = preloadQuery(me)
        const settingsRef = preloadQuery(settings)
        await new Promise(resolve => setTimeout(resolve, 20))
        return { meRef, settingsRef }
      })(loaderArgs())
    try {
      globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) =>
        operationName(init) === 'Me'
          ? answer(401, { message: 'Unauthorized' })
          : answer(200, { data: null, errors: [GRAPHQL_503_ERROR] }),
      ) as typeof fetch
      expect(ssrApiFailureCause({ root: await load() })).toBe('unavailable')

      globalThis.fetch = vi.fn(async () =>
        answer(200, {
          data: null,
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL_SERVER_ERROR', status: 500 } }],
        }),
      ) as typeof fetch
      expect(ssrApiFailureCause({ root: await load() })).toBe('other')
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

describe('apolloLoader in-flight calls and organization refusals', () => {
  const query = gql`
    query Settings {
      settings {
        id
      }
    }
  `
  function loaderArgs() {
    return {
      request: new Request('https://app.example.com/members'),
      params: {},
      context: {},
    } as never
  }
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('waits for a preload still in flight, then finds its cause', async () => {
    let answer: (response: Response) => void = () => undefined
    globalThis.fetch = vi.fn(
      () => new Promise<Response>(resolve => (answer = resolve)),
    ) as typeof fetch
    const data = apolloLoader()(({ preloadQuery }) => ({ ref: preloadQuery(query) }))(loaderArgs())
    await new Promise(resolve => setTimeout(resolve, 0))

    let settled: boolean | undefined
    const waiting = waitForSsrApiCalls({ root: data }, 5_000).then(result => (settled = result))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(settled).toBeUndefined()
    expect(ssrApiFailureCause({ root: data })).toBeUndefined()

    answer(new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }))
    await waiting
    expect(settled).toBe(true)
    expect(ssrApiFailureCause({ root: data })).toBe('unavailable')
  })

  it('gives up after the bound, saying the calls have not settled', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch
    const data = apolloLoader()(({ preloadQuery }) => ({ ref: preloadQuery(query) }))(loaderArgs())
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(await waitForSsrApiCalls({ root: data }, 20)).toBe(false)
  })

  it('resolves at once when nothing is in flight', async () => {
    expect(await waitForSsrApiCalls(undefined, 5_000)).toBe(true)
    expect(await waitForSsrApiCalls({ root: null, child: { theme: 'dark' } }, 5_000)).toBe(true)
  })

  it('records an ORGANIZATION_CONTEXT_REQUIRED refusal by code, and nothing else', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        data: null,
        errors: [
          {
            message: 'Organization context required: secret detail',
            extensions: { code: ORGANIZATION_CONTEXT_REQUIRED_CODE },
          },
        ],
      }),
    ) as typeof fetch
    const refused = await apolloLoader()(async ({ preloadQuery }) => {
      const ref = preloadQuery(query)
      await new Promise(resolve => setTimeout(resolve, 20))
      return { ref }
    })(loaderArgs())
    expect(ssrOrganizationRequired({ root: refused })).toBe(true)
    expect(ssrApiFailureCause({ root: refused })).toBe('other')

    globalThis.fetch = vi.fn(async () =>
      Response.json({ data: null, errors: [{ message: 'boom' }] }),
    ) as typeof fetch
    const failed = await apolloLoader()(async ({ preloadQuery }) => {
      const ref = preloadQuery(query)
      await new Promise(resolve => setTimeout(resolve, 20))
      return { ref }
    })(loaderArgs())
    expect(ssrOrganizationRequired({ root: failed })).toBe(false)
    expect(ssrOrganizationRequired({ root: failed, child: refused })).toBe(true)
  })

  it('isOrganizationContextRequiredError matches the code only', () => {
    const withCode = (code: string, message = 'x') =>
      new CombinedGraphQLErrors({ data: null, errors: [{ message, extensions: { code } }] })
    expect(isOrganizationContextRequiredError(withCode(ORGANIZATION_CONTEXT_REQUIRED_CODE))).toBe(
      true,
    )
    expect(isOrganizationContextRequiredError(withCode('FORBIDDEN', 'organization required'))).toBe(
      false,
    )
    expect(isOrganizationContextRequiredError(new Error(ORGANIZATION_CONTEXT_REQUIRED_CODE))).toBe(
      false,
    )
  })
})

describe('releaseApiOutage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('announces a 401 let pass during the evidence once the last evidence is released', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // A fresh copy of the module: other tests in this file can leave a retry's evidence behind.
    vi.resetModules()
    const apollo = await import('./apollo')
    const loaderFlag = {}
    const other = {}
    apollo.signalApiOutage(loaderFlag)
    apollo.signalApiOutage(other)
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      await apollo
        .makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
        .query({ query: gql('query Data { data }') })
        .catch(() => undefined)
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(apollo.isAuthFailureDeferred()).toBe(true)
    const announced = vi.fn()
    window.addEventListener(apollo.APOLLO_DEFERRED_AUTH_FAILURE_EVENT, announced)
    try {
      apollo.releaseApiOutage(loaderFlag)
      expect(announced).not.toHaveBeenCalled()
      apollo.releaseApiOutage(other)
      expect(announced).toHaveBeenCalledTimes(1)
      expect(apollo.isApiOutageSignalled()).toBe(false)
    } finally {
      window.removeEventListener(apollo.APOLLO_DEFERRED_AUTH_FAILURE_EVENT, announced)
      apollo.takeDeferredAuthFailure()
    }
  })
})

describe('SKIP_AUTH_ERROR_REPORT_CONTEXT', () => {
  const query = gql`
    query Me {
      me {
        id
      }
    }
  `
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const coded = (code: string, statusCode: number) => () =>
    json(200, {
      data: null,
      errors: [{ message: 'Refused', extensions: { code, originalError: { statusCode } } }],
    })
  const answers: Array<[string, () => Response]> = [
    ['UNAUTHENTICATED', coded('UNAUTHENTICATED', 401)],
    ['an HTTP 401', () => json(401, { message: 'Unauthorized' })],
    ['FORBIDDEN', coded('FORBIDDEN', 403)],
    ['an HTTP 403', () => json(403, { message: 'Forbidden' })],
    [ORGANIZATION_CONTEXT_REQUIRED_CODE, coded(ORGANIZATION_CONTEXT_REQUIRED_CODE, 403)],
  ]
  let testWindow: {
    location: { pathname: string; search: string; hash: string; href: string }
    dispatchEvent: ReturnType<typeof vi.fn>
  }

  // A fresh copy of the module: earlier tests in this file can leave a retry's outage evidence
  // behind, and with it every 401 here would be deferred instead of acted on.
  let apollo: typeof import('./apollo')
  beforeEach(async () => {
    vi.resetModules()
    apollo = await import('./apollo')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    testWindow = {
      location: { pathname: '/members', search: '', hash: '', href: '' },
      dispatchEvent: vi.fn(),
    }
    vi.stubGlobal('window', testWindow)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    takeDeferredAuthFailure()
  })

  async function run(answer: () => Response, context?: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => answer()),
    )
    await apollo
      .makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      .query({ query, fetchPolicy: 'no-cache', errorPolicy: 'none', context })
      .catch(() => undefined)
  }

  it.each(answers)('takes no action on %s for a request that asks so', async (_label, answer) => {
    await run(answer, apollo.SKIP_AUTH_ERROR_REPORT_CONTEXT)

    expect(testWindow.location.href).toBe('')
    expect(testWindow.dispatchEvent).not.toHaveBeenCalled()
  })

  it.each(answers)('still acts on %s for any other request', async (_label, answer) => {
    await run(answer)

    const acted = testWindow.location.href !== '' || testWindow.dispatchEvent.mock.calls.length > 0
    expect(acted).toBe(true)
  })

  it('records no deferred 401 for it during an outage, since its caller decides', async () => {
    const outage = {}
    apollo.signalApiOutage(outage)
    try {
      await run(coded('UNAUTHENTICATED', 401), apollo.SKIP_AUTH_ERROR_REPORT_CONTEXT)
      expect(apollo.isAuthFailureDeferred()).toBe(false)
    } finally {
      apollo.clearApiOutage(outage)
    }
  })

  it('still reports a request that never reached the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await apollo
      .makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      .query({ query, context: apollo.SKIP_AUTH_ERROR_REPORT_CONTEXT })
      .catch(() => undefined)

    expect(testWindow.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: apollo.APOLLO_SERVICE_UNAVAILABLE_EVENT }),
    )
  })
})

describe('the stored active organization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('ends the organization session when forgotten (a logout), not when another is stored', () => {
    const before = activeOrganizationSession()
    storeActiveOrganizationId('org-1')
    storeActiveOrganizationId('org-2')
    expect(activeOrganizationSession()).toBe(before)

    storeActiveOrganizationId(null)
    expect(activeOrganizationSession()).not.toBe(before)
  })

  it('is what the next request sends as x-organization-id, and forgetting it drops the header', async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { ping: 'pong' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
    const ping = gql`
      query Ping {
        ping
      }
    `

    storeActiveOrganizationId('org-2')
    expect(getStoredActiveOrganizationId()).toBe('org-2')
    await client.query({ query: ping, fetchPolicy: 'no-cache' })
    expect(fetchMock.mock.calls[0][1].headers['x-organization-id']).toBe('org-2')

    storeActiveOrganizationId(null)
    expect(getStoredActiveOrganizationId()).toBeNull()
    await client.query({ query: ping, fetchPolicy: 'no-cache' })
    expect(fetchMock.mock.calls[1][1].headers['x-organization-id']).toBeUndefined()
  })

  it('is never read by resolveActiveOrganization, which a server render could not match', () => {
    const organizations = [{ id: 'org-1' }, { id: 'org-2' }, { id: 'org-3' }]
    storeActiveOrganizationId('org-2')

    // Server-visible inputs only: the server's active one, else the first.
    expect(resolveActiveOrganization(organizations, 'org-3')?.id).toBe('org-3')
    expect(resolveActiveOrganization(organizations, null)?.id).toBe('org-1')
    expect(resolveActiveOrganization(organizations, 'gone')?.id).toBe('org-1')
    // A choice settled after hydration is passed in, and the server's active one still wins.
    expect(resolveActiveOrganization(organizations, null, 'org-2')?.id).toBe('org-2')
    expect(resolveActiveOrganization(organizations, 'org-3', 'org-2')?.id).toBe('org-3')
    expect(resolveActiveOrganization(organizations, null, 'gone')?.id).toBe('org-1')
    expect(resolveActiveOrganization([], null)).toBeNull()
  })

  it('leaves the organization open only with several and no server active one of them', () => {
    const two = [{ id: 'org-1' }, { id: 'org-2' }]
    expect(isActiveOrganizationAmbiguous(two, null)).toBe(true)
    expect(isActiveOrganizationAmbiguous(two, 'gone')).toBe(true)
    expect(isActiveOrganizationAmbiguous(two, 'org-2')).toBe(false)
    expect(isActiveOrganizationAmbiguous([{ id: 'org-1' }], null)).toBe(false)
    expect(isActiveOrganizationAmbiguous([], undefined)).toBe(false)
  })

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(getStoredActiveOrganizationId()).toBeNull()
    expect(() => storeActiveOrganizationId('org-2')).not.toThrow()
  })

  it('never throws when reading localStorage itself throws', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(getStoredActiveOrganizationId()).toBeNull()
    expect(() => storeActiveOrganizationId('org-2')).not.toThrow()
    expect(() => storeActiveOrganizationId(null)).not.toThrow()
  })
})
