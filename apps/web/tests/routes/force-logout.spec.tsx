import { describe, it, expect, vi } from 'vitest'
import { loader } from '../../app/routes/force-logout'

vi.mock('@nestled-template/shared/utils', () => ({
  getSessionCookieName: () => '__session',
}))

describe('Force Logout Loader', () => {
  it('should return a 302 redirect to /login', async () => {
    const request = new Request('http://localhost/force-logout')
    const response = await loader({ request })

    expect(response.status).toBe(302)
    const location = response.headers.get('Location')
    expect(location).toBeTruthy()
    expect(location?.startsWith('/login')).toBe(true)
  })

  it('should append expired=1 to the login redirect', async () => {
    const request = new Request('http://localhost/force-logout')
    const response = await loader({ request })

    const location = response.headers.get('Location') ?? ''
    expect(new URL(location, 'http://localhost').searchParams.get('expired')).toBe('1')
  })

  it('should preserve return_url when provided', async () => {
    const request = new Request(
      'http://localhost/force-logout?return_url=' + encodeURIComponent('/members/billing'),
    )
    const response = await loader({ request })

    const location = response.headers.get('Location') ?? ''
    const params = new URL(location, 'http://localhost').searchParams
    expect(params.get('return_url')).toBe('/members/billing')
    expect(params.get('expired')).toBe('1')
  })

  it('should clear the session cookie', async () => {
    const request = new Request('http://localhost/force-logout')
    const response = await loader({ request })

    // The loader can set multiple Set-Cookie headers (host-only + domain-scoped),
    // so read them all via getSetCookie() and assert on the __session clear.
    const sessionClear = response.headers.getSetCookie().find(c => c.startsWith('__session='))
    expect(sessionClear).toBeTruthy()
    expect(sessionClear).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})
