// @vitest-environment node
import {
  createRequestHandler,
  Outlet,
  RouterContextProvider,
  UNSAFE_withComponentProps as withComponentProps,
  UNSAFE_withErrorBoundaryProps as withErrorBoundaryProps,
  type ServerBuild,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetApiOutageMemory, apolloLoader } from '@nestled-template/shared/apollo'
import * as entryServer from '../../app/entry.server'
import * as rootModule from '../../app/root'
import { getSession, requireUser } from '../../app/session'
import {
  forwardedSessionCookie,
  requireSession,
  sessionToken,
} from '../../app/session/session-middleware.server'
import { SERVER_TROUBLE_TITLE } from '../../app/api-unavailable'
import { SESSION_UNKNOWN_TITLE } from '../../app/session/session-unknown'
import { UNAUTHENTICATED_RESULT } from '../helpers/api-rejection'

// The session middleware through React Router's own request handler in PRODUCTION mode, with the
// real entry.server.tsx and the real root route (middleware, loader, App, Layout, ErrorBoundary).
// The Me call goes through the production Apollo client to a stubbed `fetch`, as in a deployed app.
// One case per verdict for a document load, a `.data` client navigation and `.data` revalidations
// (root only and child only).

const COOKIE_NAME = '__session'

function unexpiredJwt(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url')
  return `header.${payload}.signature`
}

function expiredJwt(): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 60 }),
  ).toString('base64url')
  return `header.${payload}.signature`
}

const USER = {
  __typename: 'User',
  id: 'user-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: null,
  isSuperAdmin: false,
  activeOrganizationId: null,
  emails: [],
}

// The private layout's and the public page's loaders, so a spec can prove which ran.
const privateLoader = vi.fn()
const publicLoader = vi.fn()

function routeEntry(id: string, path: string | undefined, parentId?: string) {
  return {
    id,
    path,
    parentId,
    hasAction: false,
    hasLoader: true,
    hasClientAction: false,
    hasClientLoader: false,
    hasClientMiddleware: false,
    hasErrorBoundary: id === 'root',
    module: `/${id}.js`,
    imports: [],
    css: [],
  }
}

function build(): ServerBuild {
  const root = {
    ...rootModule,
    default: withComponentProps(rootModule.default),
    ErrorBoundary: withErrorBoundaryProps(rootModule.ErrorBoundary),
  }
  return {
    entry: { module: entryServer },
    routes: {
      root: { id: 'root', path: '', module: root },
      'routes/private': {
        id: 'routes/private',
        parentId: 'root',
        path: '',
        module: {
          middleware: [requireSession],
          loader: ({ context }: { context: RouterContextProvider }) => {
            privateLoader(requireUser(context).id)
            return { private: true }
          },
          default: () => <Outlet />,
        },
      },
      'routes/members': {
        id: 'routes/members',
        parentId: 'routes/private',
        path: 'members',
        module: {
          loader: () => ({ members: true }),
          default: () => <p>Members page</p>,
        },
      },
      'routes/public': {
        id: 'routes/public',
        parentId: 'root',
        path: 'public',
        module: {
          loader: ({ context }: { context: RouterContextProvider }) => {
            publicLoader(getSession(context).kind)
            return { public: true }
          },
          default: () => <p>Public page</p>,
        },
      },
    },
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: {
        root: routeEntry('root', ''),
        'routes/private': routeEntry('routes/private', '', 'root'),
        'routes/members': routeEntry('routes/members', 'members', 'routes/private'),
        'routes/public': routeEntry('routes/public', 'public', 'root'),
      },
      url: '/manifest.js',
      version: 'test',
    },
    publicPath: '/',
    assetsBuildDirectory: 'build/client',
    future: { v8_middleware: true },
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: 'initial', manifestPath: '/__manifest' },
  } as unknown as ServerBuild
}

const handler = createRequestHandler(build(), 'production')

function request(path: string, cookie: string | null = unexpiredJwt()) {
  return handler(
    new Request(`http://localhost${path}`, {
      headers: cookie === null ? {} : { cookie: `${COOKIE_NAME}=${cookie}; theme=dark` },
    }),
    new RouterContextProvider(),
  )
}

const fetchMock = vi.fn()

function isMeCall(init: RequestInit | undefined): boolean {
  return typeof init?.body === 'string' && init.body.includes('"operationName":"Me"')
}

function meCalls(): number {
  return fetchMock.mock.calls.filter(([, init]) => isMeCall(init)).length
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Answer = () => Response | Promise<Response>

/** Me answers each call in turn with the next of `answers` (the last one repeats). */
function meAnswers(...answers: Answer[]) {
  let call = 0
  fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) => {
    if (!isMeCall(init)) return json({ data: {} })
    const answer = answers[Math.min(call, answers.length - 1)]
    call += 1
    return answer()
  })
}

const signedIn: Answer = () => json({ data: { me: USER } })
const rejected: Answer = () => json(UNAUTHENTICATED_RESULT)
const unreachable: Answer = () => Promise.reject(new TypeError('fetch failed'))
const proxy503: Answer = () => json({ message: 'Service Unavailable' }, 503)
const graphql503: Answer = () =>
  json({
    data: null,
    errors: [{ message: 'Down', extensions: { code: 'INTERNAL_SERVER_ERROR', status: 503 } }],
  })
const answered500: Answer = () => json({ message: 'Internal Server Error' }, 500)
const empty: Answer = () => json({ data: { me: null } })
// A 500 whose message says "Unauthorized": message text never decides.
const unauthorizedText: Answer = () =>
  json({ data: null, errors: [{ message: 'Unauthorized', extensions: { code: 'X' } }] })

function expiredCookies(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter(
      cookie =>
        cookie.startsWith(`${COOKIE_NAME}=;`) && cookie.includes('Expires=Thu, 01 Jan 1970'),
    )
}

beforeEach(() => {
  fetchMock.mockReset()
  privateLoader.mockReset()
  publicLoader.mockReset()
  __resetApiOutageMemory()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('API_COOKIE_DOMAIN', '.example.com')
  vi.stubEnv('VITE_COOKIE_DOMAIN', '')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// A document load, a client navigation, and revalidations of the root only and the child only.
const PRIVATE_REQUESTS = [
  ['document', '/members'],
  ['.data navigation', '/members.data'],
  ['.data revalidation (root only)', '/members.data?_routes=root'],
  ['.data revalidation (child only)', '/members.data?_routes=routes%2Fmembers'],
] as const

describe('signed in', () => {
  it.each(PRIVATE_REQUESTS)('%s: the page, with exactly one Me call', async (kind, path) => {
    meAnswers(signedIn)
    const response = await request(path)

    expect(response.status).toBe(200)
    expect(meCalls()).toBe(1)
    // A revalidation runs only the loaders it names; the middleware runs every time.
    if (!kind.startsWith('.data revalidation')) expect(privateLoader).toHaveBeenCalledWith('user-1')
    if (kind === 'document') expect(await response.text()).toContain('Members page')
    expect(expiredCookies(response)).toHaveLength(0)
  })

  it('takes a transient 401 that the confirmation answers with the user as signed in', async () => {
    meAnswers(rejected, signedIn)
    const response = await request('/members')

    expect(response.status).toBe(200)
    expect(meCalls()).toBe(2)
    expect(privateLoader).toHaveBeenCalledWith('user-1')
  })
})

describe('signed out: rejected (a clean 401, confirmed, no outage)', () => {
  it('document: a 302 to /force-logout, with two Me calls and no private loader', async () => {
    meAnswers(rejected)
    const response = await request('/members')

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/force-logout?return_url=%2Fmembers')
    expect(meCalls()).toBe(2)
    expect(privateLoader).not.toHaveBeenCalled()
  })

  it.each(PRIVATE_REQUESTS.slice(1))(
    '%s: a single-fetch redirect with reload to /force-logout, no private loader',
    async (_kind, path) => {
      meAnswers(rejected)
      const response = await request(path)
      const body = await response.text()

      expect(response.status).toBe(202)
      expect(body).toContain('SingleFetchRedirect')
      expect(body).toContain('/force-logout?return_url=%2Fmembers')
      expect(body).toMatch(/"reload",true/)
      expect(privateLoader).not.toHaveBeenCalled()
    },
  )

  it('lands on SESSION_REJECTED_PATH when the app sets one (owner decision D3)', async () => {
    vi.stubEnv('SESSION_REJECTED_PATH', '/session-expired')
    meAnswers(rejected)
    const response = await request('/members')

    expect(response.headers.get('Location')).toBe('/session-expired?return_url=%2Fmembers')
  })

  it.each([
    ['document', '/public'],
    ['.data navigation', '/public.data'],
  ])(
    'public %s: renders signed out with both cookie scopes expired in place',
    async (_kind, path) => {
      meAnswers(rejected)
      const response = await request(path)

      expect(response.status).toBe(200)
      expect(publicLoader).toHaveBeenCalledWith('signed-out')
      const expired = expiredCookies(response)
      expect(expired).toHaveLength(2)
      expect(expired.filter(cookie => cookie.endsWith('; Domain=.example.com'))).toHaveLength(1)
      expect(expired.filter(cookie => !cookie.includes('Domain='))).toHaveLength(1)
    },
  )
})

describe('signed out: no session', () => {
  it.each([
    ['no cookie', null],
    ['a JWT whose exp has passed', expiredJwt()],
  ])('%s: a document redirect to /login with no Me call', async (_label, cookie) => {
    meAnswers(signedIn)
    const response = await request('/members', cookie)

    expect(response.status).toBe(302)
    // A plain 302 to a document request, with or without JavaScript.
    expect(response.headers.get('Location')).toBe('/login?return_url=%2Fmembers')
    expect(meCalls()).toBe(0)
    expect(privateLoader).not.toHaveBeenCalled()
    expect(expiredCookies(response)).toHaveLength(0)
  })

  it('.data navigation: a single-fetch redirect to /login that loads a document', async () => {
    const response = await request('/members.data', null)
    const body = await response.text()

    expect(response.status).toBe(202)
    expect(body).toContain('/login?return_url=%2Fmembers')
    // Nothing the ended session left in the tab's memory survives.
    expect(body).toMatch(/"reload",true/)
    expect(privateLoader).not.toHaveBeenCalled()
  })

  it('a public page renders signed out', async () => {
    const response = await request('/public', null)
    expect(response.status).toBe(200)
    expect(publicLoader).toHaveBeenCalledWith('signed-out')
  })
})

describe('duplicate session cookies', () => {
  // The browser can hold several (a host-only one and a parent-domain one). Only the API can tell
  // which verifies: none is dropped here, and no single one is put in front as a bearer token.
  function requestWith(cookie: string, path = '/members') {
    return handler(
      new Request(`http://localhost${path}`, { headers: { cookie } }),
      new RouterContextProvider(),
    )
  }

  function sentToApi() {
    return fetchMock.mock.calls
      .filter(([, init]) => isMeCall(init))
      .map(([, init]) => init.headers as Record<string, string>)
  }

  const newer = unexpiredJwt()
  const older = `${unexpiredJwt()}-older`

  it.each(PRIVATE_REQUESTS)(
    '%s: every candidate reaches the API, with no bearer',
    async (_k, path) => {
      meAnswers(signedIn)
      const response = await requestWith(
        `${COOKIE_NAME}=${newer}; theme=dark; ${COOKIE_NAME}=${older}`,
        path,
      )

      expect(response.status).toBe(200)
      expect(sentToApi()).toHaveLength(1)
      expect(sentToApi()[0].cookie).toBe(`${COOKIE_NAME}=${newer}; ${COOKIE_NAME}=${older}`)
      expect(sentToApi()[0]).not.toHaveProperty('authorization')
    },
  )

  it('one session cookie is sent as a bearer token, and no Cookie header, as before', async () => {
    meAnswers(signedIn)
    await requestWith(`${COOKIE_NAME}=${newer}; theme=dark`)

    expect(sentToApi()).toHaveLength(1)
    expect(sentToApi()[0].authorization).toBe(`Bearer ${newer}`)
    expect(sentToApi()[0]).not.toHaveProperty('cookie')
  })

  // Issued after the live one, as a shorter-lived duplicate is: the newest by issue time is dead.
  const now = Math.floor(Date.now() / 1000)
  const issued = (iat: number, exp: number) =>
    `h.${Buffer.from(JSON.stringify({ sub: 'user-1', iat, exp })).toString('base64url')}.s`
  const live = issued(now - 1000, now + 3600)
  const dead = issued(now - 100, now - 60)
  // From an API whose clock is ahead of this server's, so its age says nothing here.
  const ahead = issued(now + 3600, now + 7200)

  it.each([
    ['first', [dead, live]],
    ['last', [live, dead]],
    ['beside one from a clock ahead', [dead, ahead]],
  ])('an expired candidate %s does not end a session another one holds', async (_where, tokens) => {
    meAnswers(signedIn)
    const response = await requestWith(tokens.map(value => `${COOKIE_NAME}=${value}`).join('; '))

    expect(response.status).toBe(200)
    expect(meCalls()).toBe(1)
  })

  it('is signed out without a Me call only when every candidate expired', async () => {
    meAnswers(signedIn)
    const response = await requestWith(
      `${COOKIE_NAME}=${expiredJwt()}; ${COOKIE_NAME}=${expiredJwt()}2`,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login?return_url=%2Fmembers')
    expect(meCalls()).toBe(0)
  })

  it('is absent only with no nonempty session cookie', async () => {
    meAnswers(signedIn)
    const response = await requestWith(`${COOKIE_NAME}=; ${COOKIE_NAME}=; theme=dark`)

    expect(response.headers.get('Location')).toBe('/login?return_url=%2Fmembers')
    expect(meCalls()).toBe(0)
  })

  it('an outage with duplicates keeps the session', async () => {
    meAnswers(unreachable)
    const response = await requestWith(`${COOKIE_NAME}=${newer}; ${COOKIE_NAME}=${older}`)

    expect(response.status).toBe(503)
    expect(expiredCookies(response)).toEqual([])
  })

  it('forwardedSessionCookie forwards every candidate and nothing else', () => {
    const forwarded = (cookie?: string) =>
      forwardedSessionCookie(
        new Request('http://localhost/', { headers: cookie ? { cookie } : {} }),
      )
    expect(forwarded(`${COOKIE_NAME}=a; theme=dark; ${COOKIE_NAME}=b`)).toBe(
      `${COOKIE_NAME}=a; ${COOKIE_NAME}=b`,
    )
    expect(forwarded(`theme=dark; ${COOKIE_NAME}=a`)).toBe(`${COOKIE_NAME}=a`)
    expect(forwarded('theme=dark')).toBeNull()
    expect(forwarded()).toBeNull()
  })

  it('sessionToken is the only candidate, or the newest by issue time', () => {
    const issued = (iat: number) =>
      `h.${Buffer.from(JSON.stringify({ iat })).toString('base64url')}.s`
    const token = (...values: string[]) =>
      sessionToken(
        new Request('http://localhost/', {
          headers: { cookie: values.map(value => `${COOKIE_NAME}=${value}`).join('; ') },
        }),
      )
    expect(token('opaque')).toBe('opaque')
    expect(token(issued(2), issued(1))).toBe(issued(2))
    expect(token(issued(1), issued(2))).toBe(issued(2))
    expect(token('')).toBeNull()
    expect(sessionToken(new Request('http://localhost/'))).toBeNull()
  })
})

describe('unknown: the session is kept', () => {
  const OUTAGES: Array<[string, Answer[]]> = [
    ['Me gets no answer', [unreachable]],
    ['a proxy answers 503', [proxy503]],
    ['Me answers a GraphQL 503', [graphql503]],
    ['Me 401, the confirmation gets no answer', [rejected, unreachable]],
    ['Me 401, the confirmation answers 503', [rejected, proxy503]],
  ]

  it.each(OUTAGES)(
    '%s: document gets the recovering screen (503), cookie kept',
    async (_l, answers) => {
      meAnswers(...answers)
      const response = await request('/members')

      expect(response.status).toBe(503)
      expect(await response.text()).toContain(SERVER_TROUBLE_TITLE)
      expect(expiredCookies(response)).toHaveLength(0)
      expect(response.headers.get('Location')).toBeNull()
      expect(privateLoader).not.toHaveBeenCalled()
    },
  )

  it.each(PRIVATE_REQUESTS.slice(1))(
    '%s: a 503 SESSION_UNKNOWN route error, no private loader',
    async (_kind, path) => {
      meAnswers(unreachable)
      const response = await request(path)
      const body = await response.text()

      expect(response.status).toBe(503)
      expect(body).toContain('SESSION_UNKNOWN')
      expect(body).not.toContain('SingleFetchRedirect')
      expect(privateLoader).not.toHaveBeenCalled()
    },
  )

  it('Me makes no confirmation call after an outage (one Me call)', async () => {
    meAnswers(unreachable)
    await request('/members')
    expect(meCalls()).toBe(1)
  })

  it('a clean, confirmed 401 just after another request found the API down is not trusted', async () => {
    meAnswers(unreachable)
    await request('/public')
    meAnswers(rejected)
    const response = await request('/members')

    expect(response.status).toBe(503)
    expect(expiredCookies(response)).toHaveLength(0)
  })

  it.each([
    ['Me answers 500', [answered500]],
    ['Me answers null with no error', [empty]],
    ['Me answers an error whose message says "Unauthorized"', [unauthorizedText]],
    ['Me 401, the confirmation answers 500', [rejected, answered500]],
  ] as Array<[string, Answer[]]>)(
    '%s: "We couldn’t load your account" (503), cookie kept',
    async (_label, answers) => {
      meAnswers(...answers)
      const response = await request('/members')

      expect(response.status).toBe(503)
      expect(await response.text()).toContain(SESSION_UNKNOWN_TITLE)
      expect(expiredCookies(response)).toHaveLength(0)
      expect(privateLoader).not.toHaveBeenCalled()
    },
  )

  it('a public page renders with the cookie kept and the verdict unknown', async () => {
    meAnswers(unreachable)
    const response = await request('/public')

    expect(response.status).toBe(200)
    expect(publicLoader).toHaveBeenCalledWith('unknown')
    expect(expiredCookies(response)).toHaveLength(0)
  })
})

describe('the copy', () => {
  it('names the screen for an unknown verdict that is not an outage', () => {
    expect(SESSION_UNKNOWN_TITLE).toBe('We couldn’t load your account')
  })
})

describe('apolloLoader narrowing on a production .data request', () => {
  // A child loader that calls the API after the session was judged signed in. Raw errors lose their
  // status and code to React Router's sanitization; apolloLoader narrows them first.
  function buildWith(loader: () => unknown): ServerBuild {
    const base = build()
    const routes = { ...base.routes }
    const members = routes['routes/members']
    if (!members) throw new Error('build() has no members route')
    routes['routes/members'] = {
      ...members,
      module: { ...members.module, loader: apolloLoader()(loader) },
    }
    return { ...base, routes }
  }

  async function membersData(loader: () => unknown) {
    meAnswers(signedIn)
    const narrowed = createRequestHandler(buildWith(loader), 'production')
    const response = await narrowed(
      new Request('http://localhost/members.data', {
        headers: { cookie: `${COOKIE_NAME}=${unexpiredJwt()}` },
      }),
      new RouterContextProvider(),
    )
    return { status: response.status, body: await response.text() }
  }

  function apolloError(status: number) {
    return Object.assign(new Error('Response not successful'), { statusCode: status })
  }

  it('a 401 reaches the browser as 401 API_UNAUTHENTICATED, not a sign-out', async () => {
    const { status, body } = await membersData(() => {
      throw apolloError(401)
    })
    expect(status).toBe(401)
    expect(body).toContain('API_UNAUTHENTICATED')
    expect(body).not.toContain('SingleFetchRedirect')
  })

  it('no answer reaches the browser as 503 API_UNAVAILABLE', async () => {
    const { status, body } = await membersData(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(status).toBe(503)
    expect(body).toContain('API_UNAVAILABLE')
  })

  it('a 500 is sanitized as any other server error', async () => {
    const { status, body } = await membersData(() => {
      throw apolloError(500)
    })
    expect(status).toBe(500)
    expect(body).toContain('Unexpected Server Error')
    expect(body).not.toContain('API_UNAVAILABLE')
  })
})
