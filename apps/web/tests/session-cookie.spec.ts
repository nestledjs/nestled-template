// @vitest-environment node
import { RouterContextProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cookieDomainFromSetting,
  expiredSessionCookies,
  sessionCookieDomain,
} from '../app/session/session-cookie'
import { loader as forceLogoutLoader } from '../app/routes/force-logout'
import { createSessionMiddleware } from '../app/session/session-middleware.server'

// Every sign-out the web server performs expires the session cookie wherever the API may have set
// it: for the cookie domain (API_COOKIE_DOMAIN on the API) and host-only. A cookie the API set for
// the parent domain survived a sign-out that expired only the host-only one, and signed the user
// straight back in; the web service reads the API's own variable when it has no VITE_ one.

const SESSION = '__session'
const EXPIRED = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'

function sessionClears(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter(cookie => cookie.startsWith(`${SESSION}=;`) && cookie.includes(EXPIRED))
}

describe('expiring the session cookie on sign-out', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_COOKIE_DOMAIN', '')
    vi.stubEnv('API_COOKIE_DOMAIN', '')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it.each([
    ['VITE_COOKIE_DOMAIN', '.example.com'],
    ['API_COOKIE_DOMAIN', '.example.com'],
  ])('expires both the %s cookie and the host-only one', (variable, domain) => {
    vi.stubEnv(variable, domain)

    expect(sessionCookieDomain()).toBe(domain)
    expect(expiredSessionCookies(SESSION)).toEqual([
      `${SESSION}=; Path=/; ${EXPIRED}; HttpOnly; SameSite=Lax; Domain=${domain}`,
      `${SESSION}=; Path=/; ${EXPIRED}; HttpOnly; SameSite=Lax`,
    ])
  })

  it('prefers VITE_COOKIE_DOMAIN when both are set', () => {
    vi.stubEnv('VITE_COOKIE_DOMAIN', '.web.example.com')
    vi.stubEnv('API_COOKIE_DOMAIN', '.example.com')

    expect(sessionCookieDomain()).toBe('.web.example.com')
  })

  it('reads a comma-separated API_COOKIE_DOMAIN as the API does: its first entry', () => {
    vi.stubEnv('API_COOKIE_DOMAIN', '.example.com,.example.org')

    expect(expiredSessionCookies(SESSION)).toEqual([
      `${SESSION}=; Path=/; ${EXPIRED}; HttpOnly; SameSite=Lax; Domain=.example.com`,
      `${SESSION}=; Path=/; ${EXPIRED}; HttpOnly; SameSite=Lax`,
    ])
  })

  it('keeps the domain of a host that only starts with 127.', () => {
    vi.stubEnv('API_COOKIE_DOMAIN', '127.example.com')

    expect(sessionCookieDomain()).toBe('127.example.com')
    expect(expiredSessionCookies(SESSION)).toHaveLength(2)
  })

  it.each(['', 'localhost', '127.0.0.1', '[::1]'])(
    'expires only the host-only cookie for %j, which the API never uses as a domain',
    domain => {
      vi.stubEnv('API_COOKIE_DOMAIN', domain)

      expect(sessionCookieDomain()).toBeUndefined()
      expect(expiredSessionCookies(SESSION)).toEqual([
        `${SESSION}=; Path=/; ${EXPIRED}; HttpOnly; SameSite=Lax`,
      ])
    },
  )

  it('/force-logout expires both when only the API variable is set', async () => {
    vi.stubEnv('API_COOKIE_DOMAIN', '.example.com')

    const response = await forceLogoutLoader({
      request: new Request('https://app.example.com/force-logout'),
    })

    expect(sessionClears(response)).toHaveLength(2)
    expect(sessionClears(response).some(cookie => cookie.endsWith('Domain=.example.com'))).toBe(
      true,
    )
  })

  it('the session middleware expires both on a rejected session, in place', async () => {
    vi.stubEnv('API_COOKIE_DOMAIN', '.example.com')
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url')
    const middleware = createSessionMiddleware({
      fetchMe: async () => ({ kind: 'error', cause: 'unauthenticated' }),
    })

    const response = (await middleware(
      {
        request: new Request('https://app.example.com/pricing', {
          headers: { cookie: `__session=h.${payload}.s` },
        }),
        context: new RouterContextProvider(),
        params: {},
        pattern: '/pricing',
      } as never,
      async () => new Response('page'),
    )) as Response

    expect(response.status).toBe(200)
    expect(sessionClears(response)).toHaveLength(2)
  })
})

// The rule the API sets its session cookie's `Domain` with (libs/api/config cookie-domain.ts).
// libs/api/config/src/lib/cookie-domain.spec.ts runs the same table against the API's copy; keep
// the two tables identical.
const SETTING_CASES: ReadonlyArray<[string | undefined, string | undefined]> = [
  [undefined, undefined],
  ['', undefined],
  ['   ', undefined],
  ['localhost', undefined],
  [' localhost ', undefined],
  ['127.0.0.1', undefined],
  ['[::1]', undefined],
  ['127.example.com', '127.example.com'],
  ['.127.example.com', '.127.example.com'],
  ['example.com', 'example.com'],
  ['.example.com', '.example.com'],
  ['app.example.com', 'app.example.com'],
  [' .example.com ', '.example.com'],
  ['.example.com,.example.org', '.example.com'],
  ['.example.com, .example.org', '.example.com'],
  [' , .example.com', '.example.com'],
  ['localhost,.example.com', undefined],
]

describe('cookieDomainFromSetting: the API rule', () => {
  it.each(SETTING_CASES)('API_COOKIE_DOMAIN=%j sets Domain %j', (value, expected) => {
    expect(cookieDomainFromSetting(value)).toBe(expected)
  })
})

describe('sessionCookieDomain: which setting decides', () => {
  type Case = {
    name: string
    runtime?: Record<string, string>
    buildTime?: Record<string, string>
    hostDerivedDomain?: string
    expected: string | undefined
  }

  const cases: Case[] = [
    { name: 'nothing set', expected: undefined },
    {
      name: 'runtime VITE_COOKIE_DOMAIN',
      runtime: { VITE_COOKIE_DOMAIN: '.example.com' },
      expected: '.example.com',
    },
    {
      name: 'runtime API_COOKIE_DOMAIN',
      runtime: { API_COOKIE_DOMAIN: '.example.com' },
      expected: '.example.com',
    },
    {
      name: 'build-time VITE_COOKIE_DOMAIN when the runtime has neither',
      buildTime: { VITE_COOKIE_DOMAIN: '.example.com' },
      expected: '.example.com',
    },
    {
      name: 'runtime VITE_COOKIE_DOMAIN over build-time',
      runtime: { VITE_COOKIE_DOMAIN: '.web.example.com' },
      buildTime: { VITE_COOKIE_DOMAIN: '.example.com' },
      expected: '.web.example.com',
    },
    {
      name: 'build-time VITE_COOKIE_DOMAIN over runtime API_COOKIE_DOMAIN',
      runtime: { API_COOKIE_DOMAIN: '.example.com' },
      buildTime: { VITE_COOKIE_DOMAIN: '.web.example.com' },
      expected: '.web.example.com',
    },
    {
      name: 'a blank VITE_COOKIE_DOMAIN falls through to API_COOKIE_DOMAIN',
      runtime: { VITE_COOKIE_DOMAIN: '  ', API_COOKIE_DOMAIN: '.example.com' },
      expected: '.example.com',
    },
    {
      name: 'a comma-separated VITE_COOKIE_DOMAIN, by the same rule',
      runtime: { VITE_COOKIE_DOMAIN: '.example.com,.example.org' },
      expected: '.example.com',
    },
    {
      name: 'a loopback setting is host-only',
      runtime: { API_COOKIE_DOMAIN: '[::1]' },
      expected: undefined,
    },
    {
      name: 'the host-derived domain when nothing is set',
      hostDerivedDomain: '.example.com',
      expected: '.example.com',
    },
    {
      name: 'a host-derived subdomain when nothing is set',
      hostDerivedDomain: 'app.example.com',
      expected: 'app.example.com',
    },
    {
      name: 'a setting over the host-derived domain',
      runtime: { API_COOKIE_DOMAIN: '.example.com' },
      hostDerivedDomain: '.other.example',
      expected: '.example.com',
    },
    {
      name: 'a loopback setting over the host-derived domain (still host-only)',
      runtime: { API_COOKIE_DOMAIN: 'localhost' },
      hostDerivedDomain: '.example.com',
      expected: undefined,
    },
    { name: 'a host-derived localhost', hostDerivedDomain: 'localhost', expected: undefined },
    { name: 'a host-derived 127.0.0.1', hostDerivedDomain: '127.0.0.1', expected: undefined },
    { name: 'a host-derived [::1]', hostDerivedDomain: '[::1]', expected: undefined },
    {
      name: 'a host-derived 127.example.com',
      hostDerivedDomain: '127.example.com',
      expected: '127.example.com',
    },
  ]

  it.each(cases)('$name → $expected', ({ runtime, buildTime, hostDerivedDomain, expected }) => {
    expect(
      sessionCookieDomain(
        { hostDerivedDomain },
        { runtime: runtime ?? {}, buildTime: buildTime ?? {} },
      ),
    ).toBe(expected)
  })

  it('expiredSessionCookies expires the host-derived domain cookie and the host-only one', () => {
    expect(
      expiredSessionCookies(
        SESSION,
        { hostDerivedDomain: '.example.com' },
        { runtime: {}, buildTime: {} },
      ),
    ).toEqual([
      `${SESSION}=; Path=/; ${EXPIRED}; HttpOnly; SameSite=Lax; Domain=.example.com`,
      `${SESSION}=; Path=/; ${EXPIRED}; HttpOnly; SameSite=Lax`,
    ])
  })
})
