// @vitest-environment node
import {
  createRequestHandler,
  Outlet,
  UNSAFE_withComponentProps as withComponentProps,
  UNSAFE_withErrorBoundaryProps as withErrorBoundaryProps,
  type ServerBuild,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as entryServer from '../app/entry.server'
import { shellErrorOutcome } from '../app/entry.server'
import * as rootModule from '../app/root'
import { OFFLINE_TITLE, SERVER_TROUBLE_MESSAGE, SERVER_TROUBLE_TITLE } from '../app/api-unavailable'

// A signed-in reload, rendered on the server through React Router's own request handler, the real
// entry.server.tsx and the real root route (loader, App, Layout and ErrorBoundary). The Me preload
// goes through the production Apollo client to a stubbed `fetch`, so the shell render fails the
// way it does in production: with Apollo's redacted "event stream" error.

const COOKIE_NAME = '__session'

function unexpiredJwt(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url')
  return `header.${payload}.signature`
}

function routeEntry(id: string, path: string | undefined, parentId?: string) {
  return {
    id,
    path,
    parentId,
    hasAction: false,
    hasLoader: id === 'root',
    hasClientAction: false,
    hasClientLoader: false,
    hasClientMiddleware: false,
    hasErrorBoundary: id === 'root',
    module: `/${id}.js`,
    imports: [],
    css: [],
    clientActionModule: undefined,
    clientLoaderModule: undefined,
    clientMiddlewareModule: undefined,
    hydrateFallbackModule: undefined,
  }
}

function MembersPage() {
  return (
    <main>
      <p>Members page</p>
      <Outlet />
    </main>
  )
}

/**
 * The root route as the framework build serves it (the Vite plugin wraps the component and the
 * ErrorBoundary to pass them their props), or with a component that throws `rootError`.
 */
function build(rootError?: Error): ServerBuild {
  const root = {
    ...rootModule,
    default: withComponentProps(
      rootError
        ? () => {
            throw rootError
          }
        : rootModule.default,
    ),
    ErrorBoundary: withErrorBoundaryProps(rootModule.ErrorBoundary),
  }
  return {
    entry: { module: entryServer },
    routes: {
      root: { id: 'root', path: '', module: root },
      'routes/members': {
        id: 'routes/members',
        parentId: 'root',
        path: 'members/*',
        module: { default: MembersPage },
      },
    },
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: {
        root: routeEntry('root', ''),
        'routes/members': routeEntry('routes/members', 'members/*', 'root'),
      },
      url: '/manifest.js',
      version: 'test',
    },
    publicPath: '/',
    assetsBuildDirectory: 'build/client',
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: 'initial', manifestPath: '/__manifest' },
  } as unknown as ServerBuild
}

async function reloadSignedIn(path: string, serverBuild: ServerBuild = build()) {
  const handler = createRequestHandler(serverBuild, 'production')
  return handler(
    new Request(`http://localhost${path}`, {
      headers: { cookie: `${COOKIE_NAME}=${unexpiredJwt()}; theme=dark` },
    }),
  )
}

const fetchMock = vi.fn()

function graphqlAnswers(status: number, body: unknown = { errors: [{ message: 'error' }] }) {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )
}

function clearsTheCookie(response: Response): boolean {
  return response.headers
    .getSetCookie()
    .some(
      cookie =>
        cookie.startsWith(`${COOKIE_NAME}=;`) && cookie.includes('Expires=Thu, 01 Jan 1970'),
    )
}

describe('server render when the Me preload fails', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ['the API is unreachable', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    ['a proxy answers 502', () => graphqlAnswers(502)],
    ['a proxy answers 503', () => graphqlAnswers(503)],
    ['a proxy answers 504', () => graphqlAnswers(504)],
  ])('keeps the session and serves the 503 recovering screen when %s', async (_label, apiFails) => {
    apiFails()

    const response = await reloadSignedIn('/members/dashboard')
    const html = await response.text()
    expect(response.status).toBe(503)
    expect(clearsTheCookie(response)).toBe(false)
    expect(response.headers.get('Location')).toBeNull()
    // The root ErrorBoundary's self-recovering screen, with the server-trouble copy: the page
    // reached the browser, so the user's connection works.
    expect(html).toContain(SERVER_TROUBLE_TITLE)
    expect(html).toContain(SERVER_TROUBLE_MESSAGE)
    expect(html).toContain('Try again')
    expect(html).not.toContain(OFFLINE_TITLE)
  })

  it.each([
    ['answers 401', () => graphqlAnswers(401, { message: 'Unauthorized' })],
    [
      'returns an UNAUTHENTICATED GraphQL error',
      () =>
        graphqlAnswers(200, {
          data: null,
          errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
        }),
    ],
  ])('clears the cookie and goes to /force-logout when the API %s', async (_label, rejects) => {
    rejects()

    const response = await reloadSignedIn('/members/dashboard')

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      `/force-logout?return_url=${encodeURIComponent('/members/dashboard')}`,
    )
    expect(clearsTheCookie(response)).toBe(true)
  })

  it('keeps the session and serves 503 for a redacted error with no recorded cause', async () => {
    // Nothing recorded why the render failed (no loader's Apollo client saw a failure): fail safe.
    graphqlAnswers(200, { data: { me: { __typename: 'User', id: 'user-1' } } })
    const response = await reloadSignedIn(
      '/members/dashboard',
      build(new Error('Error from event stream. Redacted for security concerns.')),
    )
    const html = await response.text()

    expect(response.status).toBe(503)
    expect(clearsTheCookie(response)).toBe(false)
    expect(html).toContain(SERVER_TROUBLE_TITLE)
  })

  it('leaves an ordinary render error to the error screen, without touching the session', async () => {
    graphqlAnswers(200, { data: { me: { __typename: 'User', id: 'user-1' } } })
    const response = await reloadSignedIn('/members/dashboard', build(new Error('A render bug')))

    expect(response.status).toBe(500)
    expect(clearsTheCookie(response)).toBe(false)
    expect(await response.text()).not.toContain(SERVER_TROUBLE_TITLE)
  })

  it.each([
    ['unavailable (a proxy answers 503)', () => graphqlAnswers(503)],
    ['unauthenticated (401)', () => graphqlAnswers(401, { message: 'Unauthorized' })],
  ])(
    'serves 500 for a plain render error even when a preload failed as %s',
    async (_label, preloadFails) => {
      // The Me preload fails and its Apollo client records the cause, but the shell fails for an
      // unrelated reason. The recorded cause must not turn a render bug into the recovering
      // screen, or into a sign-out.
      preloadFails()
      const response = await reloadSignedIn('/members/dashboard', build(new Error('A render bug')))

      expect(response.status).toBe(500)
      expect(clearsTheCookie(response)).toBe(false)
      expect(response.headers.get('Location')).toBeNull()
      expect(await response.text()).not.toContain(SERVER_TROUBLE_TITLE)
    },
  )
})

describe('shellErrorOutcome', () => {
  const redacted = new Error('Error from event stream. Redacted for security concerns.')

  it.each([
    ['unauthenticated', redacted, 'force-logout'],
    ['unavailable', redacted, 'unavailable'],
    [undefined, redacted, 'unavailable'],
    [undefined, new Error('A render bug'), 'error'],
    ['other', redacted, 'error'],
    // A recorded cause never applies to a shell error that is not an API failure.
    ['unauthenticated', new Error('A render bug'), 'error'],
    ['unavailable', new Error('A render bug'), 'error'],
    ['unavailable', new TypeError("Cannot read properties of undefined (reading 'id')"), 'error'],
    // A shell error that is itself an API failure: the recorded cause, else its own.
    ['unauthenticated', new TypeError('fetch failed'), 'force-logout'],
    [undefined, new TypeError('fetch failed'), 'unavailable'],
    [
      undefined,
      Object.assign(new Error('Response not successful'), { statusCode: 503 }),
      'unavailable',
    ],
    [
      undefined,
      Object.assign(new Error('Response not successful'), { statusCode: 401 }),
      'force-logout',
    ],
  ] as const)('cause %s with %s -> %s', (cause, error, outcome) => {
    expect(shellErrorOutcome(error, cause)).toBe(outcome)
  })
})
