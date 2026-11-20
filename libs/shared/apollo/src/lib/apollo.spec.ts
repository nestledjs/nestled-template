import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ApolloLink, CombinedGraphQLErrors, gql, ServerError } from '@apollo/client'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_ORGANIZATION_REQUIRED_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  APOLLO_SESSION_SUSPECT_EVENT,
  __resetActiveOrganizationSessionChange,
  activeOrganizationSession,
  classifyApiFailure,
  clearActiveOrganizationForSessionChange,
  getStoredActiveOrganizationId,
  isActiveOrganizationAmbiguous,
  isOrganizationContextRequiredError,
  isQueryOperation,
  isRetryableConnectivityError,
  makeClient,
  ORGANIZATION_CONTEXT_REQUIRED_CODE,
  rememberActiveOrganization,
  resolveActiveOrganization,
  storeActiveOrganizationId,
  subscriptionRetryDelayMs,
} from './apollo'
import {
  apolloLoader,
  mergeApiFailureCauses,
  ssrApiFailureCause,
  ssrOrganizationRequired,
} from './apollo-loader'
import { __resetApiOutageMemory, apiOutageSeenMsAgo } from './session/outage-memory'
import { API_UNAUTHENTICATED_CODE, API_UNAVAILABLE_CODE } from './session/narrow-api-error'

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
      // Outage outranks the 401: no revalidation is asked for, only the outage reported.
      const types = testWindow.dispatchEvent.mock.calls.map(([event]) => event.type)
      expect(types).not.toContain(APOLLO_SESSION_SUSPECT_EVENT)
      expect(types).toContain(APOLLO_SERVICE_UNAVAILABLE_EVENT)
    })
  })

  it.each([
    [
      'an HTTP 401',
      () =>
        new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    ],
    [
      'an UNAUTHENTICATED answer',
      () =>
        new Response(
          JSON.stringify({
            data: null,
            errors: [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ],
  ])('answers %s with a session-suspect event, never a navigation', async (_label, answer) => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const testWindow = {
      location: { pathname: '/admin/sessions', search: '?view=active', hash: '', href: '' },
      dispatchEvent: vi.fn(),
    }
    vi.stubGlobal('window', testWindow)
    globalThis.fetch = vi.fn().mockImplementation(async () => answer())
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })

    await client
      .query({
        query: gql`
          query PrivateData {
            privateData
          }
        `,
      })
      .catch(() => undefined)

    expect(testWindow.location.href).toBe('')
    const suspects = testWindow.dispatchEvent.mock.calls.filter(
      ([event]) => event.type === APOLLO_SESSION_SUSPECT_EVENT,
    )
    expect(suspects).toHaveLength(1)
    expect(suspects[0][0].detail).toEqual({ operation: 'PrivateData' })
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
    __resetActiveOrganizationSessionChange()
    localStorage.clear()
  })

  it('before a session change (emulation), forgets the organization and stores none until the reload', async () => {
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
    storeActiveOrganizationId('previous-users-org')
    const before = activeOrganizationSession()

    clearActiveOrganizationForSessionChange()

    expect(getStoredActiveOrganizationId()).toBeNull()
    // A switch still in flight for the previous session stores nothing.
    expect(activeOrganizationSession()).not.toBe(before)
    // The still-mounted shell re-renders while the reload is pending, and a late write arrives.
    rememberActiveOrganization('previous-users-org')
    storeActiveOrganizationId('previous-users-org')
    expect(localStorage.getItem('activeOrganizationId')).toBeNull()
    // Another tab storing one meanwhile is not sent from this document either.
    localStorage.setItem('activeOrganizationId', 'other-tabs-org')
    expect(getStoredActiveOrganizationId()).toBeNull()
    await client.query({ query: ping, fetchPolicy: 'no-cache' })
    expect(fetchMock.mock.calls[0][1].headers['x-organization-id']).toBeUndefined()
  })

  it('a plain forget (a sign-in in this document) lets the new session store its own organization', () => {
    storeActiveOrganizationId('previous-users-org')
    storeActiveOrganizationId(null)
    rememberActiveOrganization('new-users-org')
    expect(getStoredActiveOrganizationId()).toBe('new-users-org')
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

describe('the server-side outage memory', () => {
  const query = gql`
    query Ping {
      ping
    }
  `
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    __resetApiOutageMemory()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetApiOutageMemory()
  })

  async function serverQuery(answer: () => Response | Promise<Response>) {
    vi.stubGlobal('window', undefined)
    globalThis.fetch = vi.fn().mockImplementation(async () => answer())
    await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      .query({ query, fetchPolicy: 'no-cache' })
      .catch(() => undefined)
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it.each([
    ['no answer', () => Promise.reject(new TypeError('fetch failed'))],
    ['a proxy 503', () => json(503, { message: 'down' })],
    ['a GraphQL 503', () => json(200, { data: null, errors: [GRAPHQL_503_ERROR] })],
  ])('is recorded by any server-side client that meets %s', async (_label, answer) => {
    await serverQuery(answer as () => Response)
    expect(apiOutageSeenMsAgo()).toBeLessThan(1_000)
  })

  it.each([
    ['a 401', () => json(401, { message: 'Unauthorized' })],
    ['a 500', () => json(500, { message: 'boom' })],
    ['an answer', () => json(200, { data: { ping: 'pong' } })],
  ])('is not recorded for %s', async (_label, answer) => {
    await serverQuery(answer)
    expect(apiOutageSeenMsAgo()).toBeUndefined()
  })

  it('is not recorded by a browser client', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      .query({ query, fetchPolicy: 'no-cache' })
      .catch(() => undefined)
    expect(apiOutageSeenMsAgo()).toBeUndefined()
  })
})

describe('apolloLoader narrows the errors a loader throws', () => {
  const loaderArgs = () =>
    ({ request: new Request('https://app.example.com/members'), params: {}, context: {} }) as never

  async function thrownBy(loader: () => unknown) {
    try {
      await apolloLoader()(loader)(loaderArgs())
    } catch (error) {
      return error as { type?: string; data?: { code?: string }; init?: { status?: number } }
    }
    throw new Error('expected the loader to throw')
  }

  it('turns a 401 into a 401 route error with the API_UNAUTHENTICATED code', async () => {
    const error = await thrownBy(() => {
      throw new ServerError('Response not successful', {
        response: new Response(null, { status: 401 }),
        bodyText: '',
      })
    })
    expect(error).toMatchObject({
      type: 'DataWithResponseInit',
      data: { code: API_UNAUTHENTICATED_CODE },
      init: { status: 401 },
    })
  })

  it('turns an unreachable API into a 503 route error with API_UNAVAILABLE, sync or async', async () => {
    for (const loader of [
      () => {
        throw new TypeError('Failed to fetch')
      },
      async () => {
        throw new TypeError('Failed to fetch')
      },
    ]) {
      expect(await thrownBy(loader)).toMatchObject({
        data: { code: API_UNAVAILABLE_CODE },
        init: { status: 503 },
      })
    }
  })

  it('passes a thrown Response (a redirect) through untouched', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/x' } })
    expect(
      await thrownBy(() => {
        throw redirect
      }),
    ).toBe(redirect)
  })

  it('passes any other error through, judged by status and never by message', async () => {
    const bug = new Error('Unauthorized 401 UNAUTHENTICATED')
    expect(
      await thrownBy(() => {
        throw bug
      }),
    ).toBe(bug)
  })
})
