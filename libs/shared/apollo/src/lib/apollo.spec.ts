import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { gql } from '@apollo/client'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  makeClient,
} from './apollo'

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
