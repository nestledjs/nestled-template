import type { LoaderFunctionArgs } from 'react-router'
import { loader } from '../app/root'

// The cookie header carries every cookie visible to the request, including ones another app set on
// a parent domain. Before the client decoded cookie values defensively, one bad `%` sequence in any
// of them made the root loader throw, and since every route runs the root loader, every route
// returned 500.
function runRootLoader(cookie: string, path = '/') {
  const request = new Request(`http://localhost${path}`, { headers: { cookie } })
  return loader({ request, params: {}, context: {} } as unknown as LoaderFunctionArgs)
}

describe('root loader cookie handling', () => {
  it('serves a public route when an unrelated cookie is badly encoded', async () => {
    expect(await runRootLoader('other-app=%E0%A4%A; theme=light')).toEqual({ theme: 'light' })
  })

  it('treats a badly encoded session cookie as unauthenticated rather than failing', async () => {
    const result = await runRootLoader('__session=abc%zz; theme=dark', '/members/dashboard')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(302)
  })
})
