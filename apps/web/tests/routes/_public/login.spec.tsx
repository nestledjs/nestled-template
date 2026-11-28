import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loader, safeReturnUrl } from '../../../app/routes/_public/login'
import { useMutation } from '@apollo/client/react'
import { getJsonCookie } from '@nestled-template/shared/utils'
import type { AppSessionVerdict } from '../../../app/session'
import {
  NO_SESSION,
  REJECTED,
  SIGNED_IN,
  UNKNOWN,
  withSession,
} from '../../helpers/session-context'

// Mock only the essential external dependencies
vi.mock('@nestled-template/shared/utils', async importOriginal => ({
  ...(await importOriginal<object>()),
  getJsonCookie: vi.fn(),
}))

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
}))

describe('Login Component', () => {
  let mockLoginMutation: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockLoginMutation = vi.fn()

    vi.mocked(useMutation).mockReturnValue([mockLoginMutation, { loading: false }] as any)
    vi.mocked(getJsonCookie).mockReturnValue(null)
  })

  // Note: Component rendering tests are skipped due to complex dependency chain
  // (AuthLayout, Form from @nestledjs/forms, etc.) that would require extensive mocking.
  // Focus on loader function tests and E2E tests for UI validation.

  describe('Loader Function', () => {
    // async, so the loader's thrown redirect arrives as a rejection
    const runLoader = async (url: string, verdict: AppSessionVerdict) =>
      loader({ request: new Request(url), params: {}, context: withSession(verdict) } as never)

    it('redirects a visitor the session middleware judged signed in to the dashboard', async () => {
      await expect(runLoader('http://localhost/login', SIGNED_IN)).rejects.toMatchObject({
        status: 302,
      })
    })

    it.each([
      ['no session', NO_SESSION],
      ['a rejected session', REJECTED],
      ['an unknown verdict (the API did not answer)', UNKNOWN],
    ])('shows the form for %s', async (_label, verdict) => {
      vi.mocked(getJsonCookie).mockReturnValue(null)
      await expect(runLoader('http://localhost/login', verdict)).resolves.toEqual({})
    })

    it.each([
      ['a rejected session', REJECTED],
      // A parent-domain cookie that survived /force-logout and still authenticates: the form must
      // still render, so the page's expired=1 cleanup (forget the stored organization) runs.
      ['a surviving cookie the middleware judged signed in', SIGNED_IN],
    ])('shows the form after a sign-out (expired=1) for %s', async (_label, verdict) => {
      vi.mocked(getJsonCookie).mockReturnValue(null)
      await expect(runLoader('http://localhost/login?expired=1', verdict)).resolves.toEqual({})
    })

    it('should return remembered email data', async () => {
      vi.mocked(getJsonCookie).mockReturnValue({ email: 'remembered@example.com' })
      await expect(runLoader('http://localhost/login', NO_SESSION)).resolves.toEqual({
        email: 'remembered@example.com',
      })
    })
  })

  describe('safeReturnUrl', () => {
    const DEFAULT = '/members/dashboard'

    it('passes through a same-origin relative path', () => {
      expect(safeReturnUrl('/settings/profile?tab=2')).toBe('/settings/profile?tab=2')
    })

    it('falls back to the dashboard for null/empty input', () => {
      expect(safeReturnUrl(null)).toBe(DEFAULT)
      expect(safeReturnUrl('')).toBe(DEFAULT)
    })

    it('rejects protocol-relative and backslash off-site tricks', () => {
      expect(safeReturnUrl('//evil.com/x')).toBe(DEFAULT)
      expect(safeReturnUrl('/\\evil.com')).toBe(DEFAULT)
      expect(safeReturnUrl('\\evil.com')).toBe(DEFAULT)
    })

    it('reduces an absolute URL to its same-origin path (mcp-connect case)', () => {
      expect(safeReturnUrl('http://localhost/mcp-connect?back=%2Fx')).toBe('/mcp-connect?back=%2Fx')
    })

    it('keeps only the path of a cross-origin absolute URL, never leaving our origin', () => {
      expect(safeReturnUrl('https://evil.com/phish?q=1')).toBe('/phish?q=1')
    })

    it('rejects an absolute URL whose derived path is protocol-relative (//host)', () => {
      // new URL('https://host//evil.com').pathname === '//evil.com'; the origin-stripped
      // path must be re-validated so it cannot slip through as an off-site redirect.
      expect(safeReturnUrl('https://example.com//evil.com')).toBe(DEFAULT)
    })

    it('never leaves the origin through characters the URL parser drops', () => {
      // It drops tabs and newlines, so these are protocol-relative to the browser.
      expect(safeReturnUrl('/\t/evil.com')).toBe(DEFAULT)
      expect(safeReturnUrl('/\n/evil.com')).toBe(DEFAULT)
      expect(safeReturnUrl('/.//evil.com')).toBe(DEFAULT)
      expect(safeReturnUrl('/x/..//evil.com')).toBe(DEFAULT)
    })

    it.each([
      '/logout',
      '/force-logout',
      '/logout/',
      '/logout//',
      '/LogOut',
      '/FORCE-LOGOUT/',
      '/logout?return_url=/members',
      '/force-logout#x',
      '/./logout',
      '/members/../logout',
      '/members//../../logout',
      '/members/%2e%2e/logout',
      '/members/.%2E/logout',
      '/members%2f..%2flogout',
      '/%6cogout',
      '/%6Cog%6Fut',
      '/force%2dlogout',
      '/%256cogout',
      '/%25256cogout',
      '/%2flogout',
      '/logout%2f',
      '/logout%3Freturn_url=x',
      '/logout%23x',
      '/%2e/logout',
      '/logout;a=b',
      '/members;x/../logout',
      '/members;x/%252e%252e/logout',
      '/logout.data',
      '/force-logout.data',
      '/force-logout/_.data',
      '/logout%zz/../logout',
      '/%zz/%2e%2e/%6cogout',
      'https://app.example.com/force-logout',
      'https://app.example.com/%66orce-logout/',
    ])('refuses the sign-out route %s', raw => {
      expect(safeReturnUrl(raw)).toBe(DEFAULT)
    })

    it.each([
      '/x%3f/..%2Fforce-logout',
      '/x%3F/..%2flogout',
      '/x%3f/../force-logout/',
      '/X%3F/..%2FFORCE-LOGOUT',
      '/x%23/../logout',
      '/x%23/..%2Flogout/',
      '/x%3f/%2e%2e/logout',
      '/x%5c..%5clogout',
      '/x%253f/..%252fforce-logout',
      '/x%253F/../logout',
      '/x%25253f/..%25252flogout',
      '/members/%252Flogout',
      'https://app.example.com/x%3f/..%2fforce-logout',
    ])('refuses %s, whose encoded separators reach a sign-out route once decoded', raw => {
      expect(safeReturnUrl(raw)).toBe(DEFAULT)
    })

    it.each([
      '/settings/profile?next=%2Flogout',
      '/settings/profile#/logout',
      '/logout-history',
      '/members/logout',
      '/docs/force-logout/notes',
      '/members/caf%C3%A9?q=a%20b',
      '/mcp-connect?request=%25252525252525abc',
    ])('keeps the ordinary path %s', raw => {
      expect(safeReturnUrl(raw)).toBe(raw)
    })

    describe('the API host MCP authorization URL (API and web on different hosts)', () => {
      const API = 'https://api.example.com'
      const AUTHORIZE = `${API}/api/mcp/authorize?client_id=c&redirect_uri=https%3A%2F%2Fclient.example%2Fcb&code_challenge=x&code_challenge_method=S256&state=s`

      it('is kept whole, so the sign-in returns to the authorization request on the API', () => {
        expect(safeReturnUrl(AUTHORIZE, API)).toBe(AUTHORIZE)
      })

      it('is the configured API origin by default', () => {
        const configured = new URL(import.meta.env.VITE_API_URL || 'http://localhost:3000').origin
        const url = `${configured}/api/mcp/authorize?client_id=c`
        expect(safeReturnUrl(url)).toBe(url)
      })

      it.each([
        // Another endpoint of the API, or a near miss of this one, is reduced to its path as before.
        [`${API}/api/mcp/token?x=1`, '/api/mcp/token?x=1'],
        [`${API}/api/mcp/authorize/pending?request=r`, '/api/mcp/authorize/pending?request=r'],
        [`${API}/api/mcp/%61uthorize?x=1`, '/api/mcp/%61uthorize?x=1'],
        [`${API}/graphql`, '/graphql'],
        // Another host, scheme or port with the same path: never left for.
        ['https://evil.example/api/mcp/authorize?x=1', '/api/mcp/authorize?x=1'],
        ['http://api.example.com/api/mcp/authorize?x=1', '/api/mcp/authorize?x=1'],
        ['https://api.example.com:8443/api/mcp/authorize?x=1', '/api/mcp/authorize?x=1'],
        ['https://api.example.com.evil.example/api/mcp/authorize', '/api/mcp/authorize'],
      ])('only that one: %s stays on this origin', (raw, path) => {
        expect(safeReturnUrl(raw, API)).toBe(path)
      })

      it('refuses credentials in the URL', () => {
        expect(safeReturnUrl('https://user:pw@api.example.com/api/mcp/authorize?x=1', API)).toBe(
          '/api/mcp/authorize?x=1',
        )
      })

      it('drops a fragment', () => {
        expect(safeReturnUrl(`${API}/api/mcp/authorize?x=1#frag`, API)).toBe(
          `${API}/api/mcp/authorize?x=1`,
        )
      })
    })

    it('falls back for non-path schemes like javascript:', () => {
      expect(safeReturnUrl('javascript:alert(1)')).toBe(DEFAULT)
    })
  })
})
