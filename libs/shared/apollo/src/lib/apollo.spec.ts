import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { gql } from '@apollo/client'
import { APOLLO_ACCESS_FORBIDDEN_EVENT, decodeBase64UrlSegment, makeClient } from './apollo'

function jwtWithIssuedAt(iat: number): string {
  const payload = Buffer.from(JSON.stringify({ iat })).toString('base64url')
  return `header.${payload}.signature`
}

describe('decodeBase64UrlSegment', () => {
  it('decodes a JWT payload segment without Buffer', () => {
    // The web bundle polyfills nothing, so decoding through Buffer threw a ReferenceError on every
    // token in the browser. It never surfaced: pickNewestJwt's catch treats the throw as a
    // malformed token and falls back to the LAST cookie value -- the behaviour that path exists to
    // stop relying on, since document.cookie orders by path specificity rather than by age.
    //
    // Buffer is removed around this pure call only. Removing it around a live Apollo client
    // instead leaves module state behind that breaks unrelated tests later in this file.
    const payload = { iat: 2 }
    const segment = Buffer.from(JSON.stringify(payload)).toString('base64url')

    vi.stubGlobal('Buffer', undefined)
    try {
      expect(JSON.parse(decodeBase64UrlSegment(segment))).toEqual(payload)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('restores padding that base64url omits', () => {
    // atob rejects unpadded input, and base64url strips it. A single-character remainder is the
    // case that needs two '=' back.
    const value = 'a'
    const segment = Buffer.from(value).toString('base64url').replaceAll('=', '')

    expect(decodeBase64UrlSegment(segment)).toBe(value)
  })

  it('throws a clear error rather than guessing when no decoder exists', () => {
    // Guarding on atob alone would take the browser branch in a runtime that has atob but not
    // TextDecoder, throw there, and land in pickNewestJwt's catch -- restoring the silent
    // last-cookie fallback this whole change removes.
    const segment = Buffer.from(JSON.stringify({ iat: 1 })).toString('base64url')

    vi.stubGlobal('Buffer', undefined)
    vi.stubGlobal('atob', () => 'unused')
    vi.stubGlobal('TextDecoder', undefined)
    try {
      expect(() => decodeBase64UrlSegment(segment)).toThrow(/neither Buffer nor atob/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('prefers Buffer where it exists so SSR keeps one decoder', () => {
    // The doc and upgrade note claim SSR falls back to Buffer. Node exposes atob, so guarding on
    // atob first made that claim false and the Buffer branch dead.
    const atobSpy = vi.fn(() => 'should not be called')
    vi.stubGlobal('atob', atobSpy)
    try {
      const segment = Buffer.from(JSON.stringify({ iat: 7 })).toString('base64url')
      expect(JSON.parse(decodeBase64UrlSegment(segment))).toEqual({ iat: 7 })
      expect(atobSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('decodes the URL-safe alphabet', () => {
    // Payloads containing '-' or '_' decode to different bytes than '+' and '/' would.
    const payload = { sub: 'a~b?c>d' }
    const segment = Buffer.from(JSON.stringify(payload)).toString('base64url')

    expect(JSON.parse(decodeBase64UrlSegment(segment))).toEqual(payload)
  })
})

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
    // realistic hostile ordering.
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

    // Override the cookie getter rather than replacing `document`. jsdom cannot hold two cookies
    // of the same name, and swapping the whole object detaches the event target that later tests
    // in this file rely on.
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => `__session=${newer}; theme=dark; __session=${older}`,
    })

    try {
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
      Reflect.deleteProperty(document, 'cookie')
    }
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

  it('dispatches a service-unavailable event once for network connectivity failures', async () => {
    vi.useFakeTimers()
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
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: 'apollo-service-unavailable',
    })

    vi.advanceTimersByTime(30000)
    vi.useRealTimers()
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
