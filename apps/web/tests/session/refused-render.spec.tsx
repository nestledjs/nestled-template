import { Suspense } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { CombinedGraphQLErrors, ServerError, gql, type TypedDocumentNode } from '@apollo/client'
import { ApolloProvider, useReadQuery } from '@apollo/client/react'
import { createMemoryRouter, RouterProvider, useLoaderData, useRouteError } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apolloLoader, makeClient } from '@nestled-template/shared/apollo'
import { ErrorBoundary } from '../../app/root'
import { isRefusedRenderError } from '../../app/session'
import {
  __resetSessionRevalidation,
  REFUSED_RENDER_INTERVAL_MS,
} from '../../app/session/session-revalidator'
import { UNAUTHENTICATED_RESULT } from '../helpers/api-rejection'
import { stubLocation } from '../helpers/location'

// Vitest resolves the streaming package's server build, which redacts a streamed error. The client
// bundle gets its browser build, which sends the query again instead: use that one.
const streaming = vi.hoisted(() => {
  const { createRequire } = process.getBuiltinModule('node:module')
  const integration = createRequire(import.meta.url).resolve(
    '@apollo/client-integration-react-router',
  )
  const server = createRequire(integration).resolve('@apollo/client-react-streaming')
  return {
    server: server.replace('index.ssr.cjs', 'index.ssr.js'),
    browser: server.replace('index.ssr.cjs', 'index.browser.js'),
  }
})
vi.mock(streaming.server, () => import(/* @vite-ignore */ streaming.browser))

// A preload the API refuses after the request was judged signed in reaches the browser in the
// loader data stream: the component that reads it throws, and the browser's error link never sees
// it. The root ErrorBoundary asks the server to judge the session again. It never signs out.

function graphqlError(extensions: Record<string, unknown>, message = 'Nope') {
  return new CombinedGraphQLErrors({ data: null, errors: [{ message, extensions }] })
}

const refused = () => graphqlError({ code: 'UNAUTHENTICATED' })

type Outcome = () => unknown

let loads: number
let location: ReturnType<typeof stubLocation>

/** A page whose render throws whatever the loader streamed, under the app's root ErrorBoundary. */
async function renderPage(outcome: (load: number) => Outcome) {
  function Page() {
    const { result } = useLoaderData() as { result: Outcome }
    return <p>{String(result())}</p>
  }
  function Boundary() {
    return <ErrorBoundary error={useRouteError()} />
  }
  const router = createMemoryRouter(
    [
      {
        path: '/members',
        loader: () => {
          loads += 1
          return { result: outcome(loads) }
        },
        element: (
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        ),
        ErrorBoundary: Boundary,
      },
      { path: '/login', element: <p>Login</p> },
    ],
    { initialEntries: ['/members'] },
  )
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return router
}

const throwing = (error: unknown) => () => {
  throw error
}

beforeEach(() => {
  __resetSessionRevalidation()
  loads = 0
  location = stubLocation()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  expect(location.assign).not.toHaveBeenCalled()
  expect(location.replace).not.toHaveBeenCalled()
  expect(location.reload).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  __resetSessionRevalidation()
})

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('a render the API refused', () => {
  it('asks the server once, and gives way to the page when the retry succeeds', async () => {
    await renderPage(load => (load === 1 ? throwing(refused()) : () => 'the page'))
    await wait(100)

    expect(screen.getByText('the page')).toBeInTheDocument()
    expect(loads).toBe(2)
  })

  it('lets the server decide: a verdict of signed out is its redirect, not this page', async () => {
    const router = await renderPage(load => {
      if (load > 1) throw new Response(null, { status: 302, headers: { Location: '/login' } })
      return throwing(refused())
    })
    await wait(100)

    expect(router.state.location.pathname).toBe('/login')
  })

  it('a refusal that stays is at most one retry a minute, with the 401 screen between', async () => {
    const router = await renderPage(() => throwing(refused()))
    await wait(100)
    expect(loads).toBe(2)
    expect(screen.getByText('401')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    await wait(REFUSED_RENDER_INTERVAL_MS / 2)
    expect(loads).toBe(2)
    // The user's own retries load the data again, and do not add retries of their own.
    await act(() => router.revalidate())
    expect(loads).toBe(3)
    await wait(REFUSED_RENDER_INTERVAL_MS / 4)
    expect(loads).toBe(3)
    expect(router.state.location.pathname).toBe('/members')
  })
})

// The real transport: apolloLoader's preloadQuery, its stream, the browser's client and useReadQuery.
// A GraphQL answer (HTTP 200) travels in the stream as it is. An HTTP failure travels as a bare
// `error` event, and the browser's client sends the query again through its own links, so what the
// component throws is the browser's own error, with its status: never a redacted one.
// A document of the spec's own rather than one from the generated SDK, so the spec passes unchanged
// in a project whose API has none of the template's operations. The fetch below answers it.
const Widgets: TypedDocumentNode<{ widgets: Array<{ id: string }> }, Record<string, never>> = gql`
  query Widgets {
    widgets {
      id
    }
  }
`

describe('a preload refused in the loader data stream', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  const answered = () => json({ data: { widgets: [] } })

  const preload = apolloLoader()(async ({ preloadQuery }) => ({
    widgets: preloadQuery(Widgets),
  }))

  function PreloadPage() {
    const { widgets } = useLoaderData<typeof preload>()
    const { data } = useReadQuery(widgets)
    return <p>{data.widgets.length} widgets</p>
  }

  async function renderPreload(answer: (call: number) => Response) {
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls += 1
      return answer(calls)
    })
    const router = createMemoryRouter(
      [
        { path: '/', element: <p>Home</p> },
        {
          path: '/settings',
          loader: args => {
            loads += 1
            return preload(args)
          },
          element: (
            <Suspense fallback={<p>loading</p>}>
              <PreloadPage />
            </Suspense>
          ),
          ErrorBoundary: function Boundary() {
            return <ErrorBoundary error={useRouteError()} />
          },
        },
      ],
      { initialEntries: ['/'] },
    )
    await act(async () => {
      render(
        <ApolloProvider
          client={makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })}
        >
          <RouterProvider router={router} />
        </ApolloProvider>,
      )
    })
    await act(() => router.navigate('/settings'))
    await wait(100)
    return { calls: () => calls }
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  it('a GraphQL 401: one retry, which recovers', async () => {
    const { calls } = await renderPreload(call =>
      call === 1 ? json(UNAUTHENTICATED_RESULT) : answered(),
    )
    expect(await screen.findByText('0 widgets')).toBeInTheDocument()
    expect(loads).toBe(2)
    expect(calls()).toBe(2)
  })

  it('an HTTP 401, refused again in the browser: one retry, which recovers', async () => {
    const { calls } = await renderPreload(call => (call <= 2 ? json({}, 401) : answered()))
    expect(await screen.findByText('0 widgets')).toBeInTheDocument()
    expect(loads).toBe(2)
    expect(calls()).toBe(3)
  })

  it('an HTTP 401 the browser does not get again needs no retry', async () => {
    const { calls } = await renderPreload(call => (call === 1 ? json({}, 401) : answered()))
    expect(await screen.findByText('0 widgets')).toBeInTheDocument()
    expect(loads).toBe(1)
    expect(calls()).toBe(2)
  })

  it('a 500 asks nothing', async () => {
    await renderPreload(() => json({}, 500))
    await wait(REFUSED_RENDER_INTERVAL_MS)
    expect(loads).toBe(1)
  })
})

describe('what is a refused render', () => {
  it.each([
    ['a GraphQL UNAUTHENTICATED', refused(), true],
    [
      'an HTTP 401',
      new ServerError('refused', { response: new Response(null, { status: 401 }), bodyText: '' }),
      true,
    ],
    [
      'a 401 beside a 503 (an outage outranks it)',
      new CombinedGraphQLErrors({
        data: null,
        errors: [
          { message: 'a', extensions: { code: 'UNAUTHENTICATED' } },
          { message: 'b', extensions: { code: 'INTERNAL_SERVER_ERROR', status: 503 } },
        ],
      }),
      false,
    ],
    ['a message that says so', new Error('Unauthorized'), false],
    ['a GraphQL message that says so', graphqlError({ code: 'X' }, 'Unauthorized'), false],
    ['a forbidden call', graphqlError({ code: 'FORBIDDEN' }), false],
    ['nothing', undefined, false],
  ])('%s', (_label, error, expected) => {
    expect(isRefusedRenderError(error)).toBe(expected)
  })

  it('any other render error asks nothing', async () => {
    await renderPage(() => throwing(new Error('Unauthorized')))
    await wait(REFUSED_RENDER_INTERVAL_MS)
    expect(loads).toBe(1)
  })
})
