import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loader } from '../../../app/routes/auth/oauth-success'
import { getCookie, isJwtExpired } from '@nestled-template/shared/utils'

vi.mock('@nestled-template/shared/utils', () => ({
  getCookie: vi.fn(),
  getSessionCookieName: () => '__session',
  isJwtExpired: vi.fn(),
}))

const runLoader = async () => {
  const request = new Request('http://localhost/auth/oauth-success')
  try {
    await loader({ request, params: {}, context: {} } as any)
  } catch (thrown) {
    return thrown as Response
  }
  throw new Error('loader was expected to redirect')
}

describe('OAuth success loader', () => {
  beforeEach(() => {
    vi.mocked(getCookie).mockReset()
    vi.mocked(isJwtExpired).mockReset()
  })

  it('redirects to the dashboard when the callback set a valid session cookie', async () => {
    vi.mocked(getCookie).mockReturnValue('valid-session-token')
    vi.mocked(isJwtExpired).mockReturnValue(false)

    const response = await runLoader()

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/members/dashboard')
  })

  it('sends the user back to login when no session cookie arrived', async () => {
    // Landing here without a cookie means the sign-in did not actually complete — bouncing to
    // the dashboard would just redirect straight back out again.
    vi.mocked(getCookie).mockReturnValue(null)

    const response = await runLoader()

    expect(response.headers.get('location')).toBe('/login?error=oauth_incomplete')
  })

  it('sends the user back to login when the session cookie is already expired', async () => {
    vi.mocked(getCookie).mockReturnValue('expired-session-token')
    vi.mocked(isJwtExpired).mockReturnValue(true)

    const response = await runLoader()

    expect(response.headers.get('location')).toBe('/login?error=oauth_incomplete')
  })
})
