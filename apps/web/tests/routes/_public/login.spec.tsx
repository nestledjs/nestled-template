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

    it('falls back for non-path schemes like javascript:', () => {
      expect(safeReturnUrl('javascript:alert(1)')).toBe(DEFAULT)
    })
  })
})
