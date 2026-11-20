// @vitest-environment node
import type { LoaderFunctionArgs } from 'react-router'
import { loader } from '../app/root'
import { resolveSession } from '../app/session/session-middleware.server'
import { NO_SESSION, withSession } from './helpers/session-context'

// The cookie header carries every cookie visible to the request, including ones another app set on
// a parent domain. Before the client decoded cookie values defensively, one bad `%` sequence in any
// of them made the root loader throw, and since every route runs the root loader, every route
// returned 500.
describe('root loader and session middleware cookie handling', () => {
  it('serves a public route when an unrelated cookie is badly encoded', () => {
    const request = new Request('http://localhost/', {
      headers: { cookie: 'other-app=%E0%A4%A; theme=light' },
    })
    expect(
      loader({
        request,
        params: {},
        context: withSession(NO_SESSION),
      } as unknown as LoaderFunctionArgs),
    ).toEqual({ session: NO_SESSION, theme: 'light' })
  })

  it('judges a badly encoded session cookie as no session, with no API call, rather than failing', async () => {
    const fetchMe = vi.fn()
    const request = new Request('http://localhost/members/dashboard', {
      headers: { cookie: '__session=abc%zz; theme=dark' },
    })
    const { verdict } = await resolveSession(request, { fetchMe })

    expect(verdict).toEqual({ kind: 'signed-out', reason: 'no-session' })
    expect(fetchMe).not.toHaveBeenCalled()
  })
})
