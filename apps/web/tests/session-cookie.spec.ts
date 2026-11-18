// @vitest-environment node
import type { LoaderFunctionArgs } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expiredSessionCookies, sessionCookieDomain } from '../app/session-cookie'
import { loader as forceLogoutLoader } from '../app/routes/force-logout'
import { loader as rootLoader } from '../app/root'

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

  it('the root loader expires both when it sends a signed-out visitor to /login', async () => {
    vi.stubEnv('API_COOKIE_DOMAIN', '.example.com')

    const response = (await rootLoader({
      request: new Request('https://app.example.com/members/dashboard'),
      params: {},
      context: {},
    } as unknown as LoaderFunctionArgs)) as Response

    expect(response.status).toBe(302)
    expect(sessionClears(response)).toHaveLength(2)
  })
})
