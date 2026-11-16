// @vitest-environment node
import type { ReactNode } from 'react'
import {
  createRequestHandler,
  isRouteErrorResponse,
  type LoaderFunctionArgs,
  Outlet,
  useLoaderData,
  UNSAFE_withComponentProps as withComponentProps,
  UNSAFE_withErrorBoundaryProps as withErrorBoundaryProps,
  type ServerBuild,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CombinedGraphQLErrors, gql, ServerError } from '@apollo/client'
import { useReadQuery, type QueryRef } from '@apollo/client/react'
import { apolloLoader, makeClient } from '@nestled-template/shared/apollo'
import * as entryServer from '../app/entry.server'
import {
  recordedLoaderCause,
  routeErrorOutcome,
  SSR_API_SETTLE_MS,
  shellErrorForErrorPage,
  shellErrorOutcome,
} from '../app/entry.server'
import * as rootModule from '../app/root'
import { OFFLINE_TITLE, SERVER_TROUBLE_MESSAGE, SERVER_TROUBLE_TITLE } from '../app/api-unavailable'
import { ORGANIZATION_PICKER_TITLE } from '../app/organization-required'

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

function routeEntry(id: string, path: string | undefined, parentId?: string, hasLoader = false) {
  return {
    id,
    path,
    parentId,
    hasAction: false,
    hasLoader: id === 'root' || hasLoader,
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
 * ErrorBoundary to pass them their props), or with a component that throws `rootError`. The
 * members route gets `membersLoader` when one is given.
 */
function build(
  rootError?: unknown,
  membersLoader?: (args: LoaderFunctionArgs) => unknown,
  overrides: {
    /** Replaces the members route's component. */
    membersComponent?: () => ReactNode
    /** Replaces the root loader (the real one runs by default). */
    rootLoader?: (args: LoaderFunctionArgs) => unknown
  } = {},
): ServerBuild {
  const root = {
    ...rootModule,
    ...(overrides.rootLoader && { loader: overrides.rootLoader }),
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
        module: {
          default: overrides.membersComponent ?? MembersPage,
          ...(membersLoader && { loader: membersLoader }),
        },
      },
    },
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: {
        root: routeEntry('root', ''),
        'routes/members': routeEntry('routes/members', 'members/*', 'root', !!membersLoader),
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

/** What the Apollo HTTP link rejects with for an answered request: a real response's status. */
function httpError(status: number): ServerError {
  return new ServerError('Response not successful', {
    response: new Response(null, { status }),
    bodyText: '',
  })
}

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

  it.each([
    ['"Unauthorized"', 'Unauthorized'],
    ['"401"', 'Request failed with status 401'],
    ['"Session has been invalidated"', 'Session has been invalidated.'],
  ])(
    'keeps the session when a GraphQL error only says %s, with no UNAUTHENTICATED code',
    async (_label, message) => {
      // Message text is never evidence of a dead session: only a 401 or the UNAUTHENTICATED code.
      graphqlAnswers(200, { data: null, errors: [{ message }] })

      const response = await reloadSignedIn('/members/dashboard')

      expect(clearsTheCookie(response)).toBe(false)
      expect(response.headers.get('Location')).toBeNull()
    },
  )

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

describe('server render when a loader awaiting Me gets a 401', () => {
  const MEMBERS_DATA = gql`
    query MembersData {
      membersData
    }
  `

  // The root preloads Me as usual; the members route's loader awaits a query of its own (as an app
  // that resolves Me in a loader does), so a failure there is thrown from the loader.
  function answer(byOperation: Record<string, () => Response>) {
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const { operationName } = JSON.parse(String(init?.body))
      return byOperation[operationName]()
    })
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const signedIn = json(200, { data: { me: { __typename: 'User', id: 'user-1' } } })

  const awaitsQuery = async () => {
    await makeClient(undefined, { apiUrl: 'http://localhost:3000/graphql' }).query({
      query: MEMBERS_DATA,
      fetchPolicy: 'network-only',
      errorPolicy: 'none',
    })
    return {}
  }

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
    ['an HTTP 401', json(401, { message: 'Unauthorized' })],
    [
      'an UNAUTHENTICATED GraphQL error',
      json(200, {
        data: null,
        errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
      }),
    ],
  ])('clears the cookie and goes to /force-logout for %s, not a 500', async (_label, rejects) => {
    answer({ Me: signedIn, MembersData: rejects })

    const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      `/force-logout?return_url=${encodeURIComponent('/members/dashboard')}`,
    )
    expect(clearsTheCookie(response)).toBe(true)
  })

  it('keeps the session and serves the 503 recovering screen when the 401 came with outage evidence', async () => {
    // Me's preload got a proxy's 503, recorded by the root loader's client.
    answer({ Me: json(503, {}), MembersData: json(401, { message: 'Unauthorized' }) })

    const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))
    const html = await response.text()

    // Outage outranks the 401: no logout, and the outage evidence survives as the recovering 503,
    // not a generic error screen that never recovers by itself.
    expect(response.status).toBe(503)
    expect(clearsTheCookie(response)).toBe(false)
    expect(response.headers.get('Location')).toBeNull()
    expect(html).not.toContain('/force-logout')
    expect(html).toContain(SERVER_TROUBLE_TITLE)
    expect(html).toContain(SERVER_TROUBLE_MESSAGE)
    expect(html).toContain('Try again')
  })

  it('serves the 503 recovering screen when the loader itself finds the API unreachable', async () => {
    answer({ Me: signedIn, MembersData: json(502, {}) })

    const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))

    expect(response.status).toBe(503)
    expect(clearsTheCookie(response)).toBe(false)
    expect(response.headers.get('Location')).toBeNull()
    expect(await response.text()).toContain(SERVER_TROUBLE_TITLE)
  })

  it('keeps the session and shows the organization picker when the loader gets ORGANIZATION_CONTEXT_REQUIRED', async () => {
    // Signed in, but no active organization: the API refuses with a 403 code. In production React
    // Router sanitizes the loader's error to "Unexpected Server Error" before `handleRequest`, so
    // the code has to survive through `handleError`, or the root ErrorBoundary shows the generic
    // error page instead of the picker.
    const refusal = 'Organization context required: secret detail'
    answer({
      Me: signedIn,
      MembersData: json(200, {
        data: null,
        errors: [
          {
            message: refusal,
            extensions: {
              code: 'ORGANIZATION_CONTEXT_REQUIRED',
              originalError: { statusCode: 403, code: 'ORGANIZATION_CONTEXT_REQUIRED' },
            },
          },
        ],
      }),
    })

    const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))
    const html = await response.text()

    expect(response.status).toBe(403)
    expect(clearsTheCookie(response)).toBe(false)
    expect(response.headers.get('Location')).toBeNull()
    expect(html).not.toContain('/force-logout')
    expect(html).toContain(ORGANIZATION_PICKER_TITLE)
    expect(html).not.toContain('You don’t have permission to view this page')
    // The generic error screen shows the sanitized error.
    expect(html).not.toContain('Unexpected Server Error')
    // Only the code reaches the page: never the API's message.
    expect(html).not.toContain(refusal)
  })

  it('leaves any other loader error to the error screen, cookie kept', async () => {
    answer({ Me: signedIn, MembersData: json(500, { errors: [{ message: 'boom' }] }) })

    const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))

    expect(response.status).toBe(500)
    expect(clearsTheCookie(response)).toBe(false)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('decides by status and code, never by message text, and outage outranks a 401', () => {
    const sanitized = { 'routes/members': new Error('Unexpected Server Error') }
    const failed = (error: unknown) => ({ 'routes/members': error })

    expect(routeErrorOutcome(failed(new Error('Request failed with status 401')), undefined)).toBe(
      'render',
    )
    expect(routeErrorOutcome(failed(httpError(401)), undefined)).toBe('force-logout')
    // Production: the router context holds the sanitized error; `handleError` saw the 401.
    expect(routeErrorOutcome(sanitized, 'unauthenticated')).toBe('force-logout')
    expect(routeErrorOutcome(sanitized, undefined)).toBe('render')
    // Outage evidence alongside a 401 keeps the session and serves the recovering 503.
    expect(routeErrorOutcome(failed(httpError(401)), undefined, 'unavailable')).toBe('unavailable')
    expect(
      routeErrorOutcome({ 'routes/a': httpError(401), 'routes/b': httpError(502) }, undefined),
    ).toBe('unavailable')
    expect(routeErrorOutcome(sanitized, 'unauthenticated', 'unavailable')).toBe('unavailable')
    expect(routeErrorOutcome(failed(httpError(503)), undefined)).toBe('unavailable')
    // A loader error that is not an API failure stays with the error screen, whatever was recorded.
    expect(routeErrorOutcome(failed(new Error('A loader bug')), undefined, 'unavailable')).toBe(
      'render',
    )
    expect(routeErrorOutcome(null, 'unauthenticated')).toBe('render')
    // ORGANIZATION_CONTEXT_REQUIRED, recorded by `handleError` for a sanitized error: the picker,
    // unless the request also holds an unambiguous 401 (logout) or outage evidence beside a 401.
    expect(routeErrorOutcome(sanitized, 'other', undefined, true)).toBe('organization-required')
    expect(routeErrorOutcome(sanitized, 'other', 'unavailable', true)).toBe('organization-required')
    expect(routeErrorOutcome(sanitized, 'unauthenticated', undefined, true)).toBe('force-logout')
    expect(routeErrorOutcome(sanitized, 'unauthenticated', 'unavailable', true)).toBe('unavailable')
    expect(routeErrorOutcome(null, 'other', undefined, true)).toBe('render')
  })
})

describe('shellErrorOutcome', () => {
  // Log out only on an unambiguous 401: at least one `unauthenticated` and no outage evidence
  // anywhere. Any outage (the shell error's own or a recorded one) keeps the session (503). A
  // shell error that is not an API failure is a plain 500, whatever was recorded.
  const shellErrors = {
    unauthenticated: httpError(401),
    unavailable: new TypeError('fetch failed'),
    other: new Error('A render bug'),
    redacted: new Error('Error from event stream. Redacted for security concerns.'),
  } as const
  type ShellError = keyof typeof shellErrors
  type Recorded = 'unauthenticated' | 'unavailable' | 'other' | undefined
  type Outcome = ReturnType<typeof shellErrorOutcome>

  const outcomes: Record<ShellError, [Recorded, Outcome][]> = {
    unauthenticated: [
      [undefined, 'force-logout'],
      ['unauthenticated', 'force-logout'],
      ['unavailable', 'unavailable'],
      ['other', 'force-logout'],
    ],
    unavailable: [
      [undefined, 'unavailable'],
      ['unauthenticated', 'unavailable'],
      ['unavailable', 'unavailable'],
      ['other', 'unavailable'],
    ],
    other: [
      [undefined, 'error'],
      ['unauthenticated', 'error'],
      ['unavailable', 'error'],
      ['other', 'error'],
    ],
    redacted: [
      [undefined, 'unavailable'],
      ['unauthenticated', 'force-logout'],
      ['unavailable', 'unavailable'],
      ['other', 'error'],
    ],
  }

  it.each(
    Object.entries(outcomes).flatMap(([shell, rows]) =>
      rows.map(([recorded, outcome]) => [shell as ShellError, recorded, outcome] as const),
    ),
  )('shell error %s, recorded %s -> %s', (shell, recorded, outcome) => {
    expect(shellErrorOutcome(shellErrors[shell], recorded)).toBe(outcome)
  })

  it('covers every shell error x recorded cause combination', () => {
    for (const rows of Object.values(outcomes)) {
      expect(rows.map(([recorded]) => recorded)).toEqual([
        undefined,
        'unauthenticated',
        'unavailable',
        'other',
      ])
    }
  })

  it.each([
    // A plain TypeError from application code is not an API failure.
    ['unavailable', new TypeError("Cannot read properties of undefined (reading 'id')"), 'error'],
    // A proxy's 503 is outage evidence of its own, and outranks a recorded 401.
    ['unauthenticated', httpError(503), 'unavailable'],
    [undefined, httpError(503), 'unavailable'],
    // Message text alone is not an API's verdict on the session.
    [
      undefined,
      new CombinedGraphQLErrors({ data: null, errors: [{ message: 'Unauthorized' }] }),
      'error',
    ],
    [undefined, new Error('Unauthorized'), 'error'],
    [undefined, new Error('Request failed with status 401'), 'error'],
  ] as const)('recorded %s with %s -> %s', (cause, error, outcome) => {
    expect(shellErrorOutcome(error, cause)).toBe(outcome)
  })
})

describe('server render sign-out decisions with the whole request in view', () => {
  const MEMBERS_DATA = gql`
    query MembersData {
      membersData
    }
  `

  type Respond = (init?: RequestInit) => Response | Promise<Response>

  // Each operation's answer, by name; an answer may take a while.
  function answer(byOperation: Record<string, Respond>) {
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const { operationName } = JSON.parse(String(init?.body))
      return byOperation[operationName](init)
    })
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const later =
    (ms: number, respond: Respond): Respond =>
    init =>
      new Promise(resolve => setTimeout(() => resolve(respond(init)), ms))
  const signedIn = json(200, { data: { me: { __typename: 'User', id: 'user-1' } } })
  const unauthorized = json(401, { message: 'Unauthorized' })
  const proxy503 = json(503, {})
  const organizationRequired = json(200, {
    data: null,
    errors: [
      {
        message: 'Organization context required: secret detail',
        extensions: {
          code: 'ORGANIZATION_CONTEXT_REQUIRED',
          originalError: { statusCode: 403, code: 'ORGANIZATION_CONTEXT_REQUIRED' },
        },
      },
    ],
  })

  // A members loader that awaits its query (an app that resolves Me, or anything, in a loader).
  const awaitsQuery = async () => {
    await makeClient(undefined, { apiUrl: 'http://localhost:3000/graphql' }).query({
      query: MEMBERS_DATA,
      fetchPolicy: 'network-only',
      errorPolicy: 'none',
    })
    return {}
  }
  // A members loader that preloads its query, as the template's settings pages do.
  const preloadsQuery = apolloLoader()(({ preloadQuery }) => ({
    membersRef: preloadQuery(MEMBERS_DATA),
  }))
  function ReadsPreloadedQuery() {
    const { membersRef } = useLoaderData() as { membersRef: QueryRef<unknown> }
    useReadQuery(membersRef)
    return <p>Members data</p>
  }

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

  function expectRecovering503(response: Response, html: string) {
    expect(response.status).toBe(503)
    expect(clearsTheCookie(response)).toBe(false)
    expect(response.headers.get('Location')).toBeNull()
    expect(html).toContain(SERVER_TROUBLE_TITLE)
  }

  describe("a loader's 401 waits for the request's other API calls", () => {
    it('serves the recovering 503 when the root Me preload reports a 503 after the 401', async () => {
      // The root loader returns its Me preload unawaited; the members loader's own query is
      // answered first. Deciding on that 401 alone signed the user out during an outage.
      answer({ Me: later(50, proxy503), MembersData: unauthorized })

      const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))

      expectRecovering503(response, await response.text())
    })

    it('still signs out when the other calls settle with no outage', async () => {
      answer({ Me: later(50, signedIn), MembersData: unauthorized })

      const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(
        `/force-logout?return_url=${encodeURIComponent('/members/dashboard')}`,
      )
      expect(clearsTheCookie(response)).toBe(true)
    })

    it(
      'keeps the session and serves 503 when a call is still out after the bound',
      async () => {
        // Me is answered, with no outage, only well after the bound: waiting for it would sign out.
        answer({ Me: later(SSR_API_SETTLE_MS + 500, signedIn), MembersData: unauthorized })
        const started = Date.now()

        const response = await reloadSignedIn('/members/dashboard', build(undefined, awaitsQuery))

        expect(Date.now() - started).toBeGreaterThanOrEqual(SSR_API_SETTLE_MS - 50)
        expectRecovering503(response, await response.text())
      },
      SSR_API_SETTLE_MS + 5_000,
    )
  })

  describe("the shell's 401 waits too", () => {
    it("serves the recovering 503 when Me's 401 comes before another preload's 503", async () => {
      // Me's preload fails first and fails the shell; the members route's preload, which nothing
      // renders, reports the outage a moment later.
      answer({ Me: unauthorized, MembersData: later(50, proxy503) })

      const response = await reloadSignedIn('/members/dashboard', build(undefined, preloadsQuery))

      expectRecovering503(response, await response.text())
    })

    it("signs out on Me's 401 once the other preload is answered", async () => {
      answer({ Me: unauthorized, MembersData: later(50, json(200, { data: { membersData: 1 } })) })

      const response = await reloadSignedIn('/members/dashboard', build(undefined, preloadsQuery))

      expect(response.status).toBe(302)
      expect(clearsTheCookie(response)).toBe(true)
    })
  })

  describe("the root loader's outage flag is outage evidence", () => {
    // The root loader could not start the Me preload and returned its flag instead: nothing went
    // through an Apollo client, so only the flag says the API was unreachable.
    const rootFlagsOutage = () => ({ serviceUnavailable: true, theme: 'dark' })

    it("keeps the session and serves the recovering 503 for a child loader's 401", async () => {
      answer({ MembersData: unauthorized })

      const response = await reloadSignedIn(
        '/members/dashboard',
        build(undefined, awaitsQuery, { rootLoader: rootFlagsOutage }),
      )

      expectRecovering503(response, await response.text())
    })

    it('counts the flag in recordedLoaderCause, and never as more than an outage', () => {
      expect(recordedLoaderCause({ root: { serviceUnavailable: true } })).toBe('unavailable')
      expect(recordedLoaderCause({ root: { serviceUnavailable: 'yes' } })).toBeUndefined()
      expect(recordedLoaderCause({ root: { theme: 'dark' }, child: null })).toBeUndefined()
      expect(recordedLoaderCause(undefined)).toBeUndefined()
      expect(
        routeErrorOutcome(
          { 'routes/members': httpError(401) },
          undefined,
          recordedLoaderCause({ root: { serviceUnavailable: true } }),
        ),
      ).toBe('unavailable')
      expect(
        shellErrorOutcome(
          httpError(401),
          recordedLoaderCause({ root: { serviceUnavailable: true } }),
        ),
      ).toBe('unavailable')
    })
  })

  describe('a preloaded query refused with ORGANIZATION_CONTEXT_REQUIRED (#114)', () => {
    it('serves the organization picker (403, cookie kept), not a 500', async () => {
      answer({ Me: signedIn, MembersData: organizationRequired })

      const response = await reloadSignedIn(
        '/members/dashboard',
        build(undefined, preloadsQuery, { membersComponent: ReadsPreloadedQuery }),
      )
      const html = await response.text()

      expect(response.status).toBe(403)
      expect(clearsTheCookie(response)).toBe(false)
      expect(response.headers.get('Location')).toBeNull()
      expect(html).toContain(ORGANIZATION_PICKER_TITLE)
      expect(html).not.toContain('Unexpected Server Error')
    })

    it('decides the picker only when nothing outranks it', () => {
      const redacted = new Error('Error from event stream. Redacted for security concerns.')
      expect(shellErrorOutcome(redacted, 'other', true)).toBe('organization-required')
      expect(shellErrorOutcome(redacted, 'other', false)).toBe('error')
      expect(shellErrorOutcome(redacted, 'unavailable', true)).toBe('unavailable')
      expect(shellErrorOutcome(redacted, 'unauthenticated', true)).toBe('force-logout')
      expect(shellErrorOutcome(new Error('A render bug'), undefined, true)).toBe('error')
      // The refusal as the shell error itself goes through the same precedence.
      const refusal = new CombinedGraphQLErrors({
        data: null,
        errors: [{ message: 'x', extensions: { code: 'ORGANIZATION_CONTEXT_REQUIRED' } }],
      })
      expect(shellErrorOutcome(refusal, undefined)).toBe('organization-required')
      expect(shellErrorOutcome(refusal, 'other')).toBe('organization-required')
      expect(shellErrorOutcome(refusal, 'unavailable')).toBe('unavailable')
      expect(shellErrorOutcome(refusal, 'unauthenticated')).toBe('force-logout')
    })
  })

  describe('the second render after a shell error', () => {
    it('renders the error page and does not decide again', async () => {
      // A shell error that carries a 401 status but is not an API failure the shell recognises.
      // React Router renders the error page by calling handleRequest again with it as the route
      // error, where the loader check used to read it as a loader's 401 and sign the user out.
      graphqlAnswers(200, { data: { me: { __typename: 'User', id: 'user-1' } } })

      const response = await reloadSignedIn(
        '/members/dashboard',
        build(new Response(null, { status: 401, statusText: 'Unauthorized' })),
      )

      expect(response.headers.get('Location')).toBeNull()
      expect(clearsTheCookie(response)).toBe(false)
      // Nor does the page carry a 401 route error to the browser, whose root error boundary would
      // read it as the API rejecting the session and go to /force-logout after hydration.
      expect(response.status).toBe(500)
      expect(await response.text()).not.toMatch(/ErrorResponse[^\]]*401/)
    })

    it('passes a render 401 on as a plain error, and keeps every other status', () => {
      const thrown401 = shellErrorForErrorPage(new Response(null, { status: 401 }))
      expect(thrown401).toBeInstanceOf(Error)
      expect(isRouteErrorResponse(thrown401)).toBe(false)
      const notFound = new Response(null, { status: 404 })
      expect(shellErrorForErrorPage(notFound)).toBe(notFound)
      const bug = new Error('A render bug')
      expect(shellErrorForErrorPage(bug)).toBe(bug)
    })
  })
})
