import { describe, it, expect } from 'vitest'
import { loader } from '../../../app/routes/auth/oauth-success'
import type { AppSessionVerdict } from '../../../app/session'
import {
  NO_SESSION,
  REJECTED,
  SIGNED_IN,
  UNKNOWN,
  withSession,
} from '../../helpers/session-context'

const runLoader = async (verdict: AppSessionVerdict) => {
  const request = new Request('http://localhost/auth/oauth-success')
  try {
    await loader({ request, params: {}, context: withSession(verdict) } as never)
  } catch (thrown) {
    return thrown as Response
  }
  throw new Error('loader was expected to redirect')
}

describe('OAuth success loader', () => {
  it('redirects to the dashboard when the session middleware judged the new cookie signed in', async () => {
    const response = await runLoader(SIGNED_IN)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/members/dashboard')
  })

  it.each([
    ['no session cookie arrived', NO_SESSION],
    ['the API rejected the cookie', REJECTED],
  ])('sends the user back to login when %s', async (_label, verdict) => {
    // Signed out here means the sign-in did not actually complete: bouncing to the dashboard would
    // just send the user straight back out again.
    const response = await runLoader(verdict)

    expect(response.headers.get('location')).toBe('/login?error=oauth_incomplete')
  })

  it('goes on to the dashboard while the verdict is unknown (the API did not answer just now)', async () => {
    const response = await runLoader(UNKNOWN)

    expect(response.headers.get('location')).toBe('/members/dashboard')
  })
})
