// @vitest-environment node
import { renderToString } from 'react-dom/server'
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  UNSAFE_ErrorResponseImpl as ErrorResponseImpl,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CombinedGraphQLErrors } from '@apollo/client'
import { API_UNAUTHENTICATED_CODE } from '@nestled-template/shared/apollo'
import { ErrorBoundary } from '../app/root'

// The root Layout owns the document (<html>, <head>, <body>) and wraps the ErrorBoundary too. A
// boundary that renders its own nests a document in the body: invalid HTML, and the browser's
// repair makes hydration fail on the very screen that should recover. Server-render every screen
// the boundary can show and look for one.

async function renderBoundary(error: unknown): Promise<string> {
  const routes = [{ path: '/', element: <ErrorBoundary error={error} /> }]
  const handler = createStaticHandler(routes)
  const context = await handler.query(new Request('http://localhost/'))
  if (context instanceof Response) throw new Error('unexpected response')
  return renderToString(
    <StaticRouterProvider
      router={createStaticRouter(handler.dataRoutes, context)}
      context={context}
      hydrate={false}
    />,
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the root ErrorBoundary renders no document of its own', () => {
  it.each([
    ['a 404', new ErrorResponseImpl(404, 'Not Found', null)],
    ['a 403', new ErrorResponseImpl(403, 'Forbidden', null)],
    ['a route 401', new ErrorResponseImpl(401, 'Unauthorized', { code: API_UNAUTHENTICATED_CODE })],
    ['a 500', new ErrorResponseImpl(500, 'Internal Server Error', null)],
    ['a 502', new ErrorResponseImpl(502, 'Bad Gateway', null)],
    ['a 503', new ErrorResponseImpl(503, 'Service Unavailable', null)],
    [
      'an unknown session',
      new ErrorResponseImpl(503, 'Service Unavailable', {
        code: 'SESSION_UNKNOWN',
        reason: 'outage',
      }),
    ],
    [
      'a refused render',
      new CombinedGraphQLErrors({
        data: null,
        errors: [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }],
      }),
    ],
    ['a thrown Error', new Error('boom')],
    ['a thrown string', 'boom'],
    ['nothing', undefined],
  ])('%s', async (_label, error) => {
    const html = await renderBoundary(error)

    expect(html.length).toBeGreaterThan(0)
    expect(html).not.toMatch(/<(?:!doctype|html|head|body)[\s>]/i)
  })
})
