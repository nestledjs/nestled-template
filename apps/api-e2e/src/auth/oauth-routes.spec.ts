import { describe, it, expect } from 'vitest'
import axios from 'axios'

/**
 * Regression test for the OAuth double-prefix bug (N1 / C1).
 *
 * The app sets a global prefix of `api`, and the OAuth controller is mounted at `auth`, so its
 * routes register at `/api/auth/...`. A previous `@Controller('api/auth')` double-prefixed every
 * route to `/api/api/auth/...`, leaving `/api/auth/google/authorize` unrouted → 404, which silently
 * broke every Google/GitHub OAuth login in the template and every child repo.
 *
 * These routes must be REACHABLE (not 404). With no OAuth credentials configured in the test env,
 * the authorize handlers respond 400 ("... OAuth is not configured") — proving the route resolves
 * to the controller rather than falling through to a 404.
 */
describe('OAuth routes are reachable at /api/auth (not double-prefixed)', () => {
  it('GET /api/auth/google/authorize resolves to the controller (400 not-configured, not 404)', async () => {
    const res = await axios.get('/api/auth/google/authorize', { validateStatus: () => true })
    expect(res.status).not.toBe(404)
    expect(res.status).toBe(400)
  })

  it('GET /api/auth/github/authorize resolves to the controller (400 not-configured, not 404)', async () => {
    const res = await axios.get('/api/auth/github/authorize', { validateStatus: () => true })
    expect(res.status).not.toBe(404)
    expect(res.status).toBe(400)
  })

  it('the old double-prefixed path /api/api/auth/google/authorize does NOT exist (404)', async () => {
    const res = await axios.get('/api/api/auth/google/authorize', { validateStatus: () => true })
    expect(res.status).toBe(404)
  })
})
