import { type ReactNode, StrictMode, Suspense, useEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  Navigate,
  Outlet,
  RouterProvider,
  UNSAFE_ErrorResponseImpl as ErrorResponseImpl,
  useRouteError,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_DEFERRED_AUTH_FAILURE_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
  clearApiOutage,
  isApiOutageSignalled,
  makeClient,
  signalApiOutage,
  takeDeferredAuthFailure,
} from '@nestled-template/shared/apollo'
import { App, AppCodeErrorMarker, isAppCodeError } from '../app/app'
import { ErrorBoundary } from '../app/root'
import {
  CONFIRM_DELAYS_MS,
  RETURN_TRIGGER_DEBOUNCE_MS,
  probeApi,
  probeConnectivity,
  refetchFailedQueries,
  reloadForRecovery,
  retryDelayMs,
  trimTrailingSlashes,
  useApiAvailability,
  useRefetchFailedQueries,
} from '../app/api-availability'
import { ApolloProvider, createQueryPreloader } from '@apollo/client/react'
import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  gql,
  InMemoryCache,
  Observable,
  ServerError,
} from '@apollo/client'
import { useGlobalCtx } from '@nestled-template/web'
import {
  OFFLINE_MESSAGE,
  OFFLINE_TITLE,
  RecoveringApiUnavailable,
  SERVER_TROUBLE_MESSAGE,
  SERVER_TROUBLE_TITLE,
} from '../app/api-unavailable'

const CONFIRM_WINDOW_MS = CONFIRM_DELAYS_MS.reduce((total, delay) => total + delay, 0)
const SERVER_DOWN = SERVER_TROUBLE_TITLE
const OFFLINE = OFFLINE_TITLE

const fetchMock = vi.fn()

function isApiProbe(url: unknown): boolean {
  return String(url).endsWith('/api/uptime')
}

function apiProbeCalls() {
  return fetchMock.mock.calls.filter(([url]) => isApiProbe(url))
}

function apiUp() {
  fetchMock.mockResolvedValue(new Response('12.3', { status: 200 }))
}

/** The API does not answer; the web app's own origin still does (our servers are in trouble). */
function apiDown() {
  fetchMock.mockImplementation(async (url: unknown) => {
    if (isApiProbe(url)) throw new TypeError('Failed to fetch')
    return new Response(null, { status: 200 })
  })
}

/** Nothing answers: neither the API nor the web app's origin (the connection is gone). */
function networkDown() {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function renderApp(loader: () => unknown = () => ({})) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader,
        element: <App />,
        children: [{ index: true, element: <p>Protected page</p> }],
      },
    ],
    { initialEntries: ['/'] },
  )
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return router
}

async function reportOutage() {
  await act(async () => {
    globalThis.dispatchEvent(new CustomEvent(APOLLO_SERVICE_UNAVAILABLE_EVENT))
  })
}

describe('API unavailable screen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('does not take the app down for one failed request', async () => {
    apiUp()
    await renderApp()

    await reportOutage()
    expect(screen.queryByText(SERVER_DOWN)).not.toBeInTheDocument()
    await advance(CONFIRM_WINDOW_MS + 1000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/uptime$/)
    expect(screen.getByText('Protected page')).toBeInTheDocument()
    expect(screen.queryByText(SERVER_DOWN)).not.toBeInTheDocument()
  })

  it('shows the screen only once the outage is confirmed', async () => {
    apiDown()
    await renderApp()

    await reportOutage()
    await advance(CONFIRM_WINDOW_MS - 1)
    expect(screen.getByText('Protected page')).toBeInTheDocument()

    await advance(1)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
    expect(screen.getByText(SERVER_TROUBLE_MESSAGE)).toBeInTheDocument()
    expect(apiProbeCalls()).toHaveLength(CONFIRM_DELAYS_MS.length)
  })

  it('clears the screen by itself when the API answers again', async () => {
    apiDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    // Still down at the first retry; the second backs off further.
    await advance(retryDelayMs(0))
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    apiUp()
    await advance(retryDelayMs(1))
    expect(screen.queryByText(SERVER_DOWN)).not.toBeInTheDocument()
    expect(screen.getByText('Protected page')).toBeInTheDocument()
  })

  it('probes at once when the browser comes back online or the tab is shown', async () => {
    apiDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)
    const callsBefore = apiProbeCalls().length

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(apiProbeCalls()).toHaveLength(callsBefore + 1)

    apiUp()
    await act(async () => {
      globalThis.dispatchEvent(new Event('online'))
    })
    expect(apiProbeCalls()).toHaveLength(callsBefore + 2)
    expect(screen.getByText('Protected page')).toBeInTheDocument()
  })

  it('says the browser is offline when it is', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apiDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)

    expect(screen.getByRole('heading', { name: OFFLINE })).toBeInTheDocument()
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument()
  })

  it('switches to the offline copy when the offline event fires', async () => {
    apiDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    await act(async () => {
      globalThis.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('heading', { name: OFFLINE })).toBeInTheDocument()
  })

  it('checks again at once from the button', async () => {
    apiDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)

    apiUp()
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByText('Protected page')).toBeInTheDocument()
  })

  it('ignores an ordinary TypeError that reaches the global handler', async () => {
    apiDown()
    await renderApp()

    await act(async () => {
      globalThis.dispatchEvent(
        new ErrorEvent('error', {
          error: new TypeError("Cannot read properties of undefined (reading 'id')"),
        }),
      )
    })
    await advance(CONFIRM_WINDOW_MS + 1000)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('Protected page')).toBeInTheDocument()
  })

  it('leaves forbidden handling as it was', async () => {
    apiUp()
    await renderApp()

    await act(async () => {
      globalThis.dispatchEvent(new CustomEvent(APOLLO_ACCESS_FORBIDDEN_EVENT))
    })

    expect(
      screen.getByRole('heading', { name: 'You don’t have permission to view this page' }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('revalidates the loader that reported the outage once the API answers', async () => {
    apiUp()
    let loaderCalls = 0
    await renderApp(() => {
      loaderCalls += 1
      return loaderCalls === 1 ? { serviceUnavailable: true } : {}
    })
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    await advance(retryDelayMs(0))

    expect(loaderCalls).toBe(2)
    expect(screen.getByText('Protected page')).toBeInTheDocument()
  })

  it('keeps retrying at a widening interval while the loader still reports an outage', async () => {
    apiUp()
    let loaderCalls = 0
    await renderApp(() => {
      loaderCalls += 1
      return { serviceUnavailable: true }
    })

    await advance(retryDelayMs(0))
    expect(loaderCalls).toBe(2)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    await advance(retryDelayMs(1) - 1)
    expect(loaderCalls).toBe(2)
    await advance(1)
    expect(loaderCalls).toBe(3)
  })
})

describe('root error boundary for a network error', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('renders the recovering screen instead of a static one', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<ErrorBoundary error={new TypeError('Failed to fetch')} />)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
  })

  it('keeps the session on a 401 while the app has outage evidence', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const elsewhere = {}
    signalApiOutage(elsewhere)
    try {
      render(<ErrorBoundary error={new ErrorResponseImpl(401, 'Unauthorized', null)} />)
      expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
    } finally {
      clearApiOutage(elsewhere)
    }
  })

  describe('deciding a logout by status and code, never by message text', () => {
    function renderWithAssign(error: unknown) {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const assign = vi.fn()
      vi.stubGlobal('location', { ...globalThis.location, pathname: '/members', assign })
      render(<ErrorBoundary error={error} />)
      return assign
    }

    it.each([
      ['exactly "Unauthorized"', new Error('Unauthorized')],
      ['"401"', new Error('Request failed with status 401')],
      ['"Session has been invalidated"', new Error('Session has been invalidated.')],
      [
        '"Unauthorized" in a GraphQL error with no UNAUTHENTICATED code',
        new CombinedGraphQLErrors({ data: null, errors: [{ message: 'Unauthorized' }] }),
      ],
    ])('shows the error screen for an error whose message says %s', (_label, error) => {
      const assign = renderWithAssign(error)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(assign).not.toHaveBeenCalled()
    })

    it.each([
      ['a route response with status 401', new ErrorResponseImpl(401, 'Unauthorized', null)],
      [
        'an HTTP 401',
        new ServerError('Response not successful', {
          response: new Response(null, { status: 401 }),
          bodyText: '',
        }),
      ],
      [
        'an UNAUTHENTICATED GraphQL error',
        new CombinedGraphQLErrors({
          data: null,
          errors: [{ message: 'Expired', extensions: { code: 'UNAUTHENTICATED' } }],
        }),
      ],
    ])('still logs out on %s with no outage', (_label, error) => {
      const assign = renderWithAssign(error)

      expect(assign).toHaveBeenCalledWith('/force-logout?return_url=%2Fmembers')
    })
  })

  it('labels the button "Try again", not "Refresh Page"', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<ErrorBoundary error={new TypeError('Load failed')} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText(/refresh/i)).not.toBeInTheDocument()
  })

  it('treats a proxy 503 route response as a connectivity failure', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<ErrorBoundary error={new ErrorResponseImpl(503, 'Service Unavailable', null)} />)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
  })

  it('gives any other error a manual "Try again" that reloads, with no "refresh" wording', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...globalThis.location, reload })
    render(<ErrorBoundary error={new Error('Cannot read properties of undefined')} />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: SERVER_DOWN })).not.toBeInTheDocument()
    expect(screen.queryByText(/refresh/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads once the API answers, but not in a loop', async () => {
    const reload = vi.fn().mockReturnValue(true)
    const probe = vi.fn().mockResolvedValue(true)
    render(<RecoveringApiUnavailable probe={probe} reload={reload} />)

    await advance(retryDelayMs(0))
    expect(probe).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('App after an in-flight retry ends with a 401 let pass', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    takeDeferredAuthFailure()
  })

  it('refetches the query holding that 401 without being asked', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // The error link lets a 401 pass while an outage is signalled (here, a retry in flight).
    const retryInFlight = {}
    signalApiOutage(retryInFlight)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    await makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
      .query({ query: gql('query Data { data }') })
      .catch(() => undefined)
    clearApiOutage(retryInFlight)

    // The query that got it, still active and holding the 401.
    const held = {
      getCurrentResult: () => ({
        error: new ServerError('Response not successful', {
          response: new Response(null, { status: 401 }),
          bodyText: '',
        }),
      }),
      refetch: vi.fn().mockResolvedValue({}),
    }
    const client = new ApolloClient({ link: ApolloLink.empty(), cache: new InMemoryCache() })
    vi.spyOn(client, 'getObservableQueries').mockReturnValue(new Set([held]) as never)
    const router = createMemoryRouter(
      [{ path: '/', loader: () => ({}), element: <App />, children: [{ index: true }] }],
      { initialEntries: ['/'] },
    )
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <RouterProvider router={router} />
        </ApolloProvider>,
      )
    })

    await act(async () => {
      globalThis.dispatchEvent(new CustomEvent(APOLLO_DEFERRED_AUTH_FAILURE_EVENT))
    })

    expect(held.refetch).toHaveBeenCalledTimes(1)
    expect(takeDeferredAuthFailure()).toBe(false)
  })
})

describe('reloadForRecovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('reloads at most once a minute', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    expect(reloadForRecovery(1_000_000)).toBe(true)
    expect(reloadForRecovery(1_030_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadForRecovery(1_061_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('refetchFailedQueries', () => {
  function query(error?: unknown) {
    return {
      getCurrentResult: () => ({ error }),
      refetch: vi.fn().mockResolvedValue({}),
    }
  }

  it('refetches queries that failed on the network, not GraphQL errors or healthy ones', () => {
    const network = query(new TypeError('Failed to fetch'))
    const graphql = query(new CombinedGraphQLErrors({ errors: [{ message: 'Forbidden' }] }))
    const healthy = query()
    const client = { getObservableQueries: () => new Set([network, graphql, healthy]) }

    expect(refetchFailedQueries(client as never)).toBe(1)
    expect(network.refetch).toHaveBeenCalledTimes(1)
    expect(graphql.refetch).not.toHaveBeenCalled()
    expect(healthy.refetch).not.toHaveBeenCalled()
  })

  it('refetches 401s only when told an outage let them pass', () => {
    const unauthorized = query(
      new ServerError('Response not successful', {
        response: new Response(null, { status: 401 }),
        bodyText: '',
      }),
    )
    const unauthenticated = query(
      new CombinedGraphQLErrors({
        errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
      }),
    )
    const forbidden = query(new CombinedGraphQLErrors({ errors: [{ message: 'Forbidden' }] }))
    const client = {
      getObservableQueries: () => new Set([unauthorized, unauthenticated, forbidden]),
    }

    expect(refetchFailedQueries(client as never)).toBe(0)
    expect(refetchFailedQueries(client as never, { includeAuthFailures: true })).toBe(2)
    expect(unauthorized.refetch).toHaveBeenCalledTimes(1)
    expect(unauthenticated.refetch).toHaveBeenCalledTimes(1)
    expect(forbidden.refetch).not.toHaveBeenCalled()
  })
})

describe('useRefetchFailedQueries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('backs off while the same queries keep failing, and resets once they succeed', async () => {
    let failing = true
    const failed = {
      getCurrentResult: () => ({ error: failing ? new TypeError('Failed to fetch') : undefined }),
      refetch: vi.fn().mockResolvedValue({}),
    }
    const client = { getObservableQueries: () => new Set([failed]) }
    let refetch: () => void = () => undefined
    function Harness() {
      refetch = useRefetchFailedQueries()
      return null
    }
    // Only the client's getObservableQueries is used; the rest of ApolloClient is not needed.
    render(
      <ApolloProvider client={client as never}>
        <Harness />
      </ApolloProvider>,
    )

    // A burst of requests (each a "blip" from a failing /graphql) refetches once, not each time.
    act(() => {
      refetch()
      refetch()
      refetch()
    })
    expect(failed.refetch).toHaveBeenCalledTimes(1)

    // The next is deferred to the end of the 2 s window, then 4 s.
    act(() => refetch())
    expect(failed.refetch).toHaveBeenCalledTimes(1)
    await advance(retryDelayMs(0))
    expect(failed.refetch).toHaveBeenCalledTimes(2)
    act(() => refetch())
    await advance(retryDelayMs(1) - 1)
    expect(failed.refetch).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(failed.refetch).toHaveBeenCalledTimes(3)

    // Once nothing is failing the backoff resets: the next request runs at once.
    failing = false
    await advance(retryDelayMs(2))
    act(() => refetch())
    failing = true
    act(() => refetch())
    expect(failed.refetch).toHaveBeenCalledTimes(4)
  })

  it('refetches a 401 only on the pass it is asked to, even when that pass is deferred', async () => {
    const unauthorized = {
      getCurrentResult: () => ({
        error: new ServerError('Response not successful', {
          response: new Response(null, { status: 401 }),
          bodyText: '',
        }),
      }),
      refetch: vi.fn().mockResolvedValue({}),
    }
    const network = {
      getCurrentResult: () => ({ error: new TypeError('Failed to fetch') }),
      refetch: vi.fn().mockResolvedValue({}),
    }
    const client = { getObservableQueries: () => new Set([unauthorized, network]) }
    let refetch: (options?: { includeAuthFailures?: boolean }) => void = () => undefined
    function Harness() {
      refetch = useRefetchFailedQueries()
      return null
    }
    render(
      <ApolloProvider client={client as never}>
        <Harness />
      </ApolloProvider>,
    )

    act(() => refetch())
    expect(network.refetch).toHaveBeenCalledTimes(1)
    expect(unauthorized.refetch).not.toHaveBeenCalled()

    // Inside the backoff window: deferred, and it keeps the request to include the 401.
    act(() => refetch({ includeAuthFailures: true }))
    expect(unauthorized.refetch).not.toHaveBeenCalled()
    await advance(retryDelayMs(0))
    expect(unauthorized.refetch).toHaveBeenCalledTimes(1)

    // The next pass, not asked to, leaves it alone again.
    await advance(retryDelayMs(1))
    act(() => refetch())
    await advance(retryDelayMs(2))
    expect(unauthorized.refetch).toHaveBeenCalledTimes(1)
  })
})

describe('useApiAvailability onBlipCleared', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires when a reported failure clears before the screen goes up', async () => {
    const onBlipCleared = vi.fn()
    const onRecover = vi.fn()
    const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    let report: () => void = () => undefined
    function Harness() {
      const api = useApiAvailability({ probe, onBlipCleared, onRecover })
      report = api.reportConnectivityError
      return <p>{api.unavailable ? 'down' : 'up'}</p>
    }
    render(<Harness />)

    await act(async () => report())
    await advance(CONFIRM_WINDOW_MS)
    expect(screen.getByText('up')).toBeInTheDocument()
    expect(onBlipCleared).toHaveBeenCalledTimes(1)
    expect(onRecover).not.toHaveBeenCalled()
  })
})

describe('useApiAvailability outage signal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('signals an outage while confirming or unavailable, and stops on recovery and unmount', async () => {
    const probe = vi.fn().mockResolvedValue(false)
    let report: () => void = () => undefined
    function Harness() {
      const api = useApiAvailability({ probe })
      report = api.reportConnectivityError
      return <p>{api.phase}</p>
    }
    const view = render(<Harness />)
    expect(isApiOutageSignalled()).toBe(false)

    await act(async () => report())
    expect(screen.getByText('confirming')).toBeInTheDocument()
    expect(isApiOutageSignalled()).toBe(true)

    await advance(CONFIRM_WINDOW_MS)
    expect(screen.getByText('unavailable')).toBeInTheDocument()
    expect(isApiOutageSignalled()).toBe(true)

    probe.mockResolvedValue(true)
    await advance(retryDelayMs(0))
    expect(screen.getByText('available')).toBeInTheDocument()
    expect(isApiOutageSignalled()).toBe(false)

    await act(async () => report())
    expect(isApiOutageSignalled()).toBe(true)
    view.unmount()
    expect(isApiOutageSignalled()).toBe(false)
  })
})

describe('trimTrailingSlashes', () => {
  it.each([
    ['https://api.example.com', 'https://api.example.com'],
    ['https://api.example.com/', 'https://api.example.com'],
    ['https://api.example.com///', 'https://api.example.com'],
    ['/', ''],
    ['', ''],
  ])('trims %j to %j', (input, expected) => {
    expect(trimTrailingSlashes(input)).toBe(expected)
  })
})

describe('probeApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [200, true],
    [404, true],
    [401, true],
    [500, true],
    [502, false],
    [503, false],
    [504, false],
  ])('treats HTTP %i as reachable=%s', async (status, reachable) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    await expect(probeApi('https://api.example.com/api/uptime')).resolves.toBe(reachable)
  })

  it('treats a rejected fetch as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')))
    await expect(probeApi('https://api.example.com/api/uptime')).resolves.toBe(false)
  })

  it('sends no credentials and bypasses the cache', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    await probeApi('https://api.example.com/api/uptime')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/uptime',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store', method: 'GET' }),
    )
  })
})

describe('refetchFailedQueries only replays connectivity failures', () => {
  function query(error: unknown) {
    return {
      getCurrentResult: () => ({ error }),
      refetch: vi.fn().mockResolvedValue({}),
    }
  }

  function serverError(status: number) {
    return new ServerError('Response not successful', {
      response: new Response(null, { status }),
      bodyText: '',
    })
  }

  it.each([
    ['an HTTP 401', serverError(401)],
    ['an HTTP 403', serverError(403)],
    ['an HTTP 500', serverError(500)],
    [
      'a TypeError thrown by application code',
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    ],
  ])('does not refetch a query that failed with %s', (_label, error) => {
    const failed = query(error)
    const client = { getObservableQueries: () => new Set([failed]) }

    expect(refetchFailedQueries(client as never)).toBe(0)
    expect(failed.refetch).not.toHaveBeenCalled()
  })

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['an HTTP 502', serverError(502)],
    ['an HTTP 503', serverError(503)],
    ['an HTTP 504', serverError(504)],
  ])('refetches a query that failed with %s', (_label, error) => {
    const failed = query(error)
    const client = { getObservableQueries: () => new Set([failed]) }

    expect(refetchFailedQueries(client as never)).toBe(1)
    expect(failed.refetch).toHaveBeenCalledTimes(1)
  })
})

describe('useRefetchFailedQueries on returning to the window', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderHarness() {
    const failed = {
      getCurrentResult: () => ({ error: new TypeError('Failed to fetch') }),
      refetch: vi.fn().mockResolvedValue({}),
    }
    const client = { getObservableQueries: () => new Set([failed]) }
    function Harness() {
      useRefetchFailedQueries()
      return null
    }
    render(
      <ApolloProvider client={client as never}>
        <Harness />
      </ApolloProvider>,
    )
    return failed
  }

  it('refetches when a window that stayed visible regains focus', async () => {
    const failed = renderHarness()

    await act(async () => {
      globalThis.dispatchEvent(new Event('focus'))
    })
    await advance(RETURN_TRIGGER_DEBOUNCE_MS)

    expect(failed.refetch).toHaveBeenCalledTimes(1)
  })

  it('refetches once when one return fires visibilitychange, focus and online together', async () => {
    const failed = renderHarness()

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      globalThis.dispatchEvent(new Event('focus'))
      globalThis.dispatchEvent(new Event('online'))
    })
    await advance(RETURN_TRIGGER_DEBOUNCE_MS)
    expect(failed.refetch).toHaveBeenCalledTimes(1)

    // Nothing was left queued behind the backoff window by the extra events.
    await advance(retryDelayMs(0) * 4)
    expect(failed.refetch).toHaveBeenCalledTimes(1)
  })
})

describe('signed-in user after a connectivity blip', () => {
  const ME = gql`
    query Me {
      me {
        id
      }
    }
  `

  // Every state CurrentUser rendered, so a signed-out render in passing is caught too.
  const seen: string[] = []

  function CurrentUser() {
    const { user } = useGlobalCtx()
    const label = user ? `Signed in as ${user.id}` : 'Signed out'
    seen.push(label)
    return <p>{label}</p>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    seen.length = 0
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  async function renderSignedIn(
    responses: Array<() => Observable<ApolloLink.Result>>,
    {
      retryGate,
      strict = false,
    }: {
      // Held, every loader run after the first waits for it before preloading Me again.
      retryGate?: Promise<void>
      // Render under <StrictMode>, which replays effects on mount as development does.
      strict?: boolean
    } = {},
  ) {
    let requests = 0
    const link = new ApolloLink(() => {
      const respond = responses[Math.min(requests, responses.length - 1)]
      requests += 1
      return respond()
    })
    const client = new ApolloClient({ link, cache: new InMemoryCache() })
    const preload = createQueryPreloader(client)
    let loaderCalls = 0
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: async () => {
            loaderCalls += 1
            if (loaderCalls > 1 && retryGate) await retryGate
            const meQueryRef = preload(ME)
            await preload.toPromise(meQueryRef).catch(() => undefined)
            return { meQueryRef }
          },
          element: <App />,
          children: [{ index: true, element: <CurrentUser /> }],
        },
      ],
      { initialEntries: ['/'] },
    )
    const tree = (
      <ApolloProvider client={client}>
        <RouterProvider router={router} />
      </ApolloProvider>
    )
    let unmount: () => void = () => undefined
    await act(async () => {
      unmount = render(strict ? <StrictMode>{tree}</StrictMode> : tree).unmount
    })
    return { loaderCalls: () => loaderCalls, unmount }
  }

  const fails = (error: Error) => () => new Observable<ApolloLink.Result>(o => o.error(error))
  const signedIn = () =>
    new Observable<ApolloLink.Result>(o => {
      o.next({ data: { me: { __typename: 'User', id: 'user-1' } } })
      o.complete()
    })

  it('signs the user back in once the API answers, without a navigation', async () => {
    apiUp()
    const app = await renderSignedIn([fails(new TypeError('Failed to fetch')), signedIn])
    // Waiting on the retry, not rendered as signed out (which a signed-in layout turns into logout).
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
    expect(screen.queryByText('Signed out')).not.toBeInTheDocument()

    await advance(CONFIRM_WINDOW_MS)

    expect(app.loaderCalls()).toBe(2)
    expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
  })

  it('leaves a 401 to the logout flow instead of retrying it', async () => {
    apiUp()
    const unauthorized = new ServerError('Response not successful', {
      response: new Response(null, { status: 401 }),
      bodyText: '',
    })
    const app = await renderSignedIn([fails(unauthorized), signedIn])

    await advance(CONFIRM_WINDOW_MS + retryDelayMs(3))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(app.loaderCalls()).toBe(1)
    expect(screen.getByText('Signed out')).toBeInTheDocument()
  })

  describe('an answered error other than a 401', () => {
    const serverError = () =>
      fails(
        new ServerError('Response not successful', {
          response: new Response(null, { status: 500 }),
          bodyText: '',
        }),
      )
    const graphQLError = (code: string) => () =>
      new Observable<ApolloLink.Result>(o => {
        o.next({
          data: null,
          errors: [{ message: 'Something went wrong', extensions: { code } }],
        })
        o.complete()
      })

    it('keeps the session on a Me 500 and signs back in when Me succeeds', async () => {
      apiUp()
      const app = await renderSignedIn([serverError(), signedIn])

      // Retried at once (the API answered, so there is no outage to confirm), never signed out.
      await advance(0)

      expect(seen).not.toContain('Signed out')
      expect(app.loaderCalls()).toBe(2)
      expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
      // No connectivity probe: the API's answer already proved it reachable.
      expect(apiProbeCalls()).toHaveLength(0)
    })

    it('shows the recovering screen while Me keeps failing, retrying with backoff', async () => {
      apiUp()
      const app = await renderSignedIn([serverError(), serverError(), serverError(), signedIn])

      await advance(0)
      expect(app.loaderCalls()).toBe(2)
      expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

      // The next retry waits out the backoff instead of revalidating in a loop.
      await advance(retryDelayMs(0) - 1)
      expect(app.loaderCalls()).toBe(2)
      await advance(1)
      expect(app.loaderCalls()).toBe(3)

      await advance(retryDelayMs(1))
      expect(app.loaderCalls()).toBe(4)
      expect(seen).not.toContain('Signed out')
      expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
    })

    describe('under StrictMode, which replays effects on mount', () => {
      it('recovers from a Me 500 on the first render once Me succeeds', async () => {
        apiUp()
        const app = await renderSignedIn([serverError(), signedIn], { strict: true })

        await advance(0)

        expect(app.loaderCalls()).toBe(2)
        expect(seen).not.toContain('Signed out')
        expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
      })

      it('keeps retrying with backoff while Me keeps failing', async () => {
        apiUp()
        const app = await renderSignedIn([serverError(), serverError(), serverError(), signedIn], {
          strict: true,
        })

        await advance(0)
        expect(app.loaderCalls()).toBe(2)
        expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

        await advance(retryDelayMs(0) - 1)
        expect(app.loaderCalls()).toBe(2)
        await advance(1)
        expect(app.loaderCalls()).toBe(3)

        await advance(retryDelayMs(1))
        expect(app.loaderCalls()).toBe(4)
        expect(seen).not.toContain('Signed out')
        expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
      })

      it('cancels a queued retry on unmount', async () => {
        apiUp()
        const app = await renderSignedIn([serverError()], { strict: true })
        await advance(0)
        expect(app.loaderCalls()).toBe(2)

        // The next retry is queued behind the backoff; unmounting drops it.
        act(() => app.unmount())
        await advance(retryDelayMs(0) + retryDelayMs(1) + retryDelayMs(2))

        expect(app.loaderCalls()).toBe(2)
      })
    })

    it('keeps the session on a GraphQL error that is not UNAUTHENTICATED', async () => {
      apiUp()
      const app = await renderSignedIn([graphQLError('INTERNAL_SERVER_ERROR'), signedIn])

      await advance(0)

      expect(seen).not.toContain('Signed out')
      expect(app.loaderCalls()).toBe(2)
      expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
    })

    it('keeps the session on a Me GraphQL error that only says "Unauthorized", with no code', async () => {
      apiUp()
      const saysUnauthorized = () =>
        new Observable<ApolloLink.Result>(o => {
          o.next({ data: null, errors: [{ message: 'Unauthorized' }] })
          o.complete()
        })
      const app = await renderSignedIn([saysUnauthorized, signedIn])

      await advance(0)

      expect(seen).not.toContain('Signed out')
      expect(app.loaderCalls()).toBe(2)
      expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
    })

    it('still logs out on an UNAUTHENTICATED GraphQL error with no outage', async () => {
      apiUp()
      const app = await renderSignedIn([graphQLError('UNAUTHENTICATED'), signedIn])

      await advance(CONFIRM_WINDOW_MS + retryDelayMs(3))

      expect(app.loaderCalls()).toBe(1)
      expect(screen.getByText('Signed out')).toBeInTheDocument()
    })
  })

  describe('a 401 while the app has outage evidence', () => {
    // Another part of the app (a route's recovering screen, say) is already showing an outage.
    const elsewhere = {}
    const unauthorized = () =>
      fails(
        new ServerError('Response not successful', {
          response: new Response(null, { status: 401 }),
          bodyText: '',
        }),
      )

    afterEach(() => {
      clearApiOutage(elsewhere)
    })

    it('keeps the session and retries Me once the API answers', async () => {
      apiUp()
      signalApiOutage(elsewhere)
      const app = await renderSignedIn([unauthorized(), signedIn])

      // Not rendered as signed out, which a signed-in layout turns into a logout.
      expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
      expect(screen.queryByText('Signed out')).not.toBeInTheDocument()

      clearApiOutage(elsewhere)
      await advance(CONFIRM_WINDOW_MS)

      expect(app.loaderCalls()).toBe(2)
      expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
    })

    it('keeps the session when the outage is confirmed before the API recovers', async () => {
      // The probe fails through the whole confirmation window, so the outage screen goes up and
      // the boundary unmounts. When the API answers, App mounts it again with the same failed Me
      // ref (the retry has not brought a new one yet) and nothing signals an outage any more: the
      // old 401 must still not render as signed out.
      apiDown()
      signalApiOutage(elsewhere)
      // The retry's loader takes a while, as a real one can, so the failed Me ref is still the
      // current one when the outage screen comes down.
      let releaseRetry: () => void = () => undefined
      const retryGate = new Promise<void>(resolve => {
        releaseRetry = resolve
      })
      const app = await renderSignedIn([unauthorized(), signedIn], { retryGate })
      clearApiOutage(elsewhere)
      await advance(CONFIRM_WINDOW_MS)
      expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
      expect(isApiOutageSignalled()).toBe(true)

      apiUp()
      seen.length = 0
      await advance(retryDelayMs(1))
      expect(app.loaderCalls()).toBe(2)
      expect(seen).not.toContain('Signed out')

      await act(async () => releaseRetry())
      await advance(0)
      expect(seen).not.toContain('Signed out')
      expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
    })

    it('logs out when the retry after recovery gets a 401 with no outage', async () => {
      apiUp()
      signalApiOutage(elsewhere)
      const app = await renderSignedIn([unauthorized(), unauthorized()])
      expect(screen.queryByText('Signed out')).not.toBeInTheDocument()

      clearApiOutage(elsewhere)
      await advance(CONFIRM_WINDOW_MS + retryDelayMs(3))

      expect(app.loaderCalls()).toBe(2)
      expect(screen.getByText('Signed out')).toBeInTheDocument()
    })
  })

  describe("an error thrown by the app's own code", () => {
    // A signed-in layout that, like the real one, sends a signed-out render to /force-logout.
    function SignedInLayout() {
      const { user } = useGlobalCtx()
      seen.push(user ? `Signed in as ${user.id}` : 'Signed out')
      if (!user) return <Navigate to="/force-logout" replace />
      return <Outlet />
    }

    function ThrowsInRender(): never {
      throw new Error('Cannot read properties of undefined')
    }

    // App errors whose message reads like a rejected session: only the API can reject one.
    function ThrowsUnauthorizedInRender(): never {
      throw new Error('Unauthorized operation in local component')
    }

    function ThrowsExactlyUnauthorizedInRender(): never {
      throw new Error('Unauthorized')
    }

    function ThrowsSessionInvalidatedInRender(): never {
      throw new Error('Session has been invalidated in a stale local cache')
    }

    function ThrowsInEffect() {
      useEffect(() => {
        throw new Error('Cannot read properties of undefined')
      }, [])
      return <p>Broken page</p>
    }

    const forceLogout = vi.fn()

    async function renderBrokenRoute(
      Broken: () => ReactNode,
      { routeErrorBoundary = false }: { routeErrorBoundary?: boolean } = {},
    ) {
      const assign = vi.fn()
      vi.stubGlobal('location', { ...globalThis.location, assign, reload: vi.fn() })
      const link = new ApolloLink(() => signedIn())
      const client = new ApolloClient({ link, cache: new InMemoryCache() })
      const preload = createQueryPreloader(client)
      let loaderCalls = 0
      const router = createMemoryRouter(
        [
          {
            path: '/',
            loader: async () => {
              loaderCalls += 1
              const meQueryRef = preload(ME)
              await preload.toPromise(meQueryRef).catch(() => undefined)
              return { meQueryRef }
            },
            element: <App />,
            ErrorBoundary: () => <ErrorBoundary error={useRouteError()} />,
            children: [
              {
                element: <SignedInLayout />,
                children: [
                  {
                    path: 'broken',
                    element: <Broken />,
                    ...(routeErrorBoundary && {
                      ErrorBoundary: () => <p>The route&apos;s own error screen</p>,
                    }),
                  },
                ],
              },
              {
                path: 'force-logout',
                Component: () => {
                  forceLogout()
                  return <p>Force logout</p>
                },
              },
            ],
          },
        ],
        { initialEntries: ['/broken'] },
      )
      await act(async () => {
        render(
          <ApolloProvider client={client}>
            <RouterProvider router={router} />
          </ApolloProvider>,
        )
      })
      await advance(CONFIRM_WINDOW_MS + retryDelayMs(3))
      return { router, assign, loaderCalls: () => loaderCalls }
    }

    beforeEach(() => {
      forceLogout.mockReset()
    })

    it.each([
      ['during render', ThrowsInRender],
      ['in an effect', ThrowsInEffect],
      ['with "Unauthorized" in its message', ThrowsUnauthorizedInRender],
      ['with exactly "Unauthorized" as its message', ThrowsExactlyUnauthorizedInRender],
      ['with "Session has been invalidated" in its message', ThrowsSessionInvalidatedInRender],
    ])('keeps the session and shows the error screen for an error thrown %s', async (_, Broken) => {
      apiUp()
      const { router, assign } = await renderBrokenRoute(Broken)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
      // Never rendered as signed out, and never sent through logout.
      expect(seen).not.toContain('Signed out')
      expect(forceLogout).not.toHaveBeenCalled()
      expect(assign).not.toHaveBeenCalled()
      expect(router.state.location.pathname).toBe('/broken')
      // Nothing about the session was retried either: the API was never in doubt.
      expect(apiProbeCalls()).toHaveLength(0)
    })

    describe("a failure of a route's own API query, not of Me", () => {
      // What a route's useSuspenseQuery throws when its own query fails.
      const routeQueryFailures = [
        [
          'a 500',
          new ServerError('Response not successful', {
            response: new Response(null, { status: 500 }),
            bodyText: '',
          }),
        ],
        [
          'a GraphQL error that is not UNAUTHENTICATED',
          new CombinedGraphQLErrors({
            data: null,
            errors: [{ message: 'Boom', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
          }),
        ],
        [
          'an UNAUTHENTICATED GraphQL error',
          new CombinedGraphQLErrors({
            data: null,
            errors: [{ message: 'Expired', extensions: { code: 'UNAUTHENTICATED' } }],
          }),
        ],
      ] as const

      it.each(routeQueryFailures)(
        'shows the root error screen for %s, keeping the session and leaving Me alone',
        async (_label, error) => {
          apiUp()
          const { router, assign, loaderCalls } = await renderBrokenRoute(() => {
            throw error
          })

          expect(screen.getByText('Something went wrong')).toBeInTheDocument()
          // Not the Me boundary's recovering screen, and Me was not retried.
          expect(screen.queryByRole('heading', { name: SERVER_DOWN })).not.toBeInTheDocument()
          expect(loaderCalls()).toBe(1)
          expect(apiProbeCalls()).toHaveLength(0)
          expect(seen).not.toContain('Signed out')
          expect(forceLogout).not.toHaveBeenCalled()
          expect(assign).not.toHaveBeenCalled()
          expect(router.state.location.pathname).toBe('/broken')
        },
      )

      it.each(routeQueryFailures)(
        "leaves %s to the route's own error boundary",
        async (_label, error) => {
          apiUp()
          const { assign, loaderCalls } = await renderBrokenRoute(
            () => {
              throw error
            },
            { routeErrorBoundary: true },
          )

          expect(screen.getByText("The route's own error screen")).toBeInTheDocument()
          expect(screen.queryByRole('heading', { name: SERVER_DOWN })).not.toBeInTheDocument()
          expect(loaderCalls()).toBe(1)
          expect(forceLogout).not.toHaveBeenCalled()
          expect(assign).not.toHaveBeenCalled()
        },
      )
    })
  })
})

describe('AppCodeErrorMarker', () => {
  // A route's own query rejected with a 401, thrown during render. The error link deals with the
  // 401 itself; the error screen must not read the thrown error as a verdict on the session.
  const thrownByARoute = () =>
    new ServerError('Response not successful', {
      response: new Response(null, { status: 401 }),
      bodyText: '',
    })

  const forceLogout = vi.fn()

  async function renderRoutes(rootElement: ReactNode, error: Error) {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const assign = vi.fn()
    vi.stubGlobal('location', { ...globalThis.location, assign, reload: vi.fn() })
    function Broken(): never {
      throw error
    }
    const router = createMemoryRouter(
      [
        {
          path: '/',
          // No Me query: a signed-out visitor, or an app whose root loader resolved Me already.
          loader: () => ({}),
          element: rootElement,
          ErrorBoundary: () => <ErrorBoundary error={useRouteError()} />,
          children: [
            { path: 'broken', element: <Broken /> },
            {
              path: 'force-logout',
              Component: () => {
                forceLogout()
                return <p>Force logout</p>
              },
            },
          ],
        },
      ],
      { initialEntries: ['/broken'] },
    )
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    return { assign }
  }

  beforeEach(() => {
    forceLogout.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the session for a route error in an app that resolves Me in its root loader', async () => {
    // No Me boundary: the root route wraps its outlet with the marker.
    const { assign } = await renderRoutes(
      <AppCodeErrorMarker>
        <Outlet />
      </AppCodeErrorMarker>,
      thrownByARoute(),
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
    expect(forceLogout).not.toHaveBeenCalled()
  })

  it('without it, the same error reaches the root ErrorBoundary as a rejected session', async () => {
    const { assign } = await renderRoutes(<Outlet />, thrownByARoute())

    expect(assign).toHaveBeenCalledWith('/force-logout')
  })

  it("keeps the session for a route error under the template's App with no Me query", async () => {
    // A public route for a signed-out visitor: App renders the routes without a Me boundary.
    const { assign } = await renderRoutes(<App />, thrownByARoute())

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('passes the error on unchanged and marks it', async () => {
    const error = thrownByARoute()
    await renderRoutes(
      <AppCodeErrorMarker>
        <Outlet />
      </AppCodeErrorMarker>,
      error,
    )

    expect(isAppCodeError(error)).toBe(true)
    expect(isAppCodeError(thrownByARoute())).toBe(false)
  })
})

describe('root error boundary for a route error response', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a not-found page for a 404', () => {
    render(<ErrorBoundary error={new ErrorResponseImpl(404, 'Not Found', null)} />)

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: SERVER_DOWN })).not.toBeInTheDocument()
  })

  it('shows the status and its text for a 500', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...globalThis.location, reload })
    render(<ErrorBoundary error={new ErrorResponseImpl(500, 'Internal Server Error', null)} />)

    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Internal Server Error' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: SERVER_DOWN })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('offline vs server trouble', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('says our servers are in trouble when the web app answers but the API does not', async () => {
    apiDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)

    expect(screen.getByRole('heading', { name: SERVER_TROUBLE_TITLE })).toBeInTheDocument()
    expect(screen.getByText(SERVER_TROUBLE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('says the user is offline when neither the web app nor the API answers', async () => {
    networkDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)

    expect(screen.getByRole('heading', { name: OFFLINE_TITLE })).toBeInTheDocument()
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('moves between the two as conditions change, on each retry and on online/offline', async () => {
    networkDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)
    expect(screen.getByRole('heading', { name: OFFLINE_TITLE })).toBeInTheDocument()

    // The connection is back but the API is still down: the next retry says so.
    apiDown()
    await advance(retryDelayMs(0))
    expect(screen.getByRole('heading', { name: SERVER_TROUBLE_TITLE })).toBeInTheDocument()

    // The browser drops off the network: at once, without waiting for a retry.
    await act(async () => {
      globalThis.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('heading', { name: OFFLINE_TITLE })).toBeInTheDocument()

    // And comes back, with the API still down.
    await act(async () => {
      globalThis.dispatchEvent(new Event('online'))
    })
    expect(screen.getByRole('heading', { name: SERVER_TROUBLE_TITLE })).toBeInTheDocument()

    // The connection goes again between retries.
    networkDown()
    await advance(retryDelayMs(0))
    expect(screen.getByRole('heading', { name: OFFLINE_TITLE })).toBeInTheDocument()
  })

  it('says server trouble for the server-rendered 503 (the page reached the browser)', () => {
    networkDown()
    render(<ErrorBoundary error={new ErrorResponseImpl(503, 'Service Unavailable', null)} />)

    expect(screen.getByRole('heading', { name: SERVER_TROUBLE_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('takes translated copy, falling back to English for any key it leaves out', async () => {
    networkDown()
    render(<RecoveringApiUnavailable copy={{ serverTitle: 'Problemas con el servidor' }} />)

    expect(screen.getByRole('heading', { name: 'Problemas con el servidor' })).toBeInTheDocument()
    expect(screen.getByText(SERVER_TROUBLE_MESSAGE)).toBeInTheDocument()
  })
})

describe('probeConnectivity', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const API = 'https://api.example.com/api/uptime'
  const WEB = 'https://app.example.com/favicon.ico'

  it('is reachable when the API answers, without probing the web app', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(probeConnectivity(API, WEB)).resolves.toEqual({ reachable: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it.each([502, 503, 504])(
    'says server for a proxy %i, which already proves the connection works',
    async status => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status }))
      vi.stubGlobal('fetch', fetchSpy)

      await expect(probeConnectivity(API, WEB)).resolves.toEqual({
        reachable: false,
        reason: 'server',
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    },
  )

  it('says server when the API does not answer but the web app does (even with a 404)', async () => {
    const fetchSpy = vi.fn(async (url: unknown) => {
      if (url === API) throw new TypeError('Failed to fetch')
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchSpy)

    await expect(probeConnectivity(API, WEB)).resolves.toEqual({
      reachable: false,
      reason: 'server',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      WEB,
      expect.objectContaining({ method: 'HEAD', cache: 'no-store', credentials: 'omit' }),
    )
  })

  it('says offline when neither answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(probeConnectivity(API, WEB)).resolves.toEqual({
      reachable: false,
      reason: 'offline',
    })
  })

  it('says offline without a request when the browser says it is offline', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    await expect(probeConnectivity(API, WEB)).resolves.toEqual({
      reachable: false,
      reason: 'offline',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('useApiAvailability reason ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps offline when a probe started online finishes after the offline event', async () => {
    let finishProbe: (result: { reachable: boolean; reason: 'server' }) => void = () => undefined
    const probe = vi.fn(
      () =>
        new Promise<{ reachable: boolean; reason: 'server' }>(resolve => {
          finishProbe = resolve
        }),
    )
    let report: () => void = () => undefined
    function Harness() {
      const api = useApiAvailability({ probe })
      report = api.reportConnectivityError
      return <p>reason: {api.reason}</p>
    }
    render(<Harness />)

    await act(async () => report())
    await advance(0)
    expect(probe).toHaveBeenCalledTimes(1)

    // The connection drops while that probe is still in flight.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => {
      globalThis.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('reason: offline')).toBeInTheDocument()

    // The older probe then answers with a proxy's 503 ("server").
    await act(async () => finishProbe({ reachable: false, reason: 'server' }))
    expect(screen.getByText('reason: offline')).toBeInTheDocument()
  })
})

describe('useApiAvailability after an effect replay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // React StrictMode replays effects in development: cleanup (which cancels the pending timer),
  // then setup again. A failure reported before the replay left the phase stuck at `confirming`.
  it.each([
    [true, 'available'],
    [false, 'unavailable'],
  ])(
    're-arms the confirmation step, so the phase settles (API reachable: %s)',
    async (reachable, settled) => {
      const probe = vi.fn().mockResolvedValue(reachable)
      function Harness() {
        const { phase, reportConnectivityError } = useApiAvailability({ probe })
        useEffect(() => {
          reportConnectivityError()
        }, [reportConnectivityError])
        return <p>phase: {phase}</p>
      }
      render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      )
      expect(screen.getByText('phase: confirming')).toBeInTheDocument()

      await advance(CONFIRM_WINDOW_MS)

      expect(probe).toHaveBeenCalled()
      expect(screen.getByText(`phase: ${settled}`)).toBeInTheDocument()
    },
  )
})

describe('Me retry backoff under cache-and-network', () => {
  const ME = gql`
    query Me {
      me {
        id
      }
    }
  `

  function CurrentUser() {
    const { user } = useGlobalCtx()
    return <p>{user ? `Signed in as ${user.id}` : 'Signed out'}</p>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  // Answers arrive a moment after the request, as over a real network, so a cached Me can render
  // while the request is still in flight.
  const NETWORK_MS = 10

  // React renders a late network error when the act() window closes, so time moves in small steps
  // for the app's own delays, not the test's, to decide when each retry runs.
  async function advanceInSteps(ms: number, step = 25) {
    for (let elapsed = 0; elapsed < ms; elapsed += step) await advance(Math.min(step, ms - elapsed))
  }
  const fails = () =>
    new Observable<ApolloLink.Result>(o => {
      const timer = setTimeout(() => o.error(new TypeError('Failed to fetch')), NETWORK_MS)
      return () => clearTimeout(timer)
    })
  const signedIn = () =>
    new Observable<ApolloLink.Result>(o => {
      const timer = setTimeout(() => {
        o.next({ data: { me: { __typename: 'User', id: 'user-1' } } })
        o.complete()
      }, NETWORK_MS)
      return () => clearTimeout(timer)
    })

  // The production client's watch policy (libs/shared/apollo makeClient): a cached Me renders
  // first, while the network request is still in flight. The loader does not wait for the query,
  // as the root loader does not.
  async function renderSignedIn(respond: (request: number) => Observable<ApolloLink.Result>) {
    let requests = 0
    const link = new ApolloLink(() => {
      requests += 1
      return respond(requests)
    })
    const client = new ApolloClient({
      link,
      cache: new InMemoryCache(),
      defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network' } },
    })
    const preload = createQueryPreloader(client)
    let loaderCalls = 0
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: () => {
            loaderCalls += 1
            return { meQueryRef: preload(ME) }
          },
          element: (
            <Suspense fallback={<p>Loading</p>}>
              <App />
            </Suspense>
          ),
          children: [{ index: true, element: <CurrentUser /> }],
        },
      ],
      { initialEntries: ['/'] },
    )
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <RouterProvider router={router} />
        </ApolloProvider>,
      )
    })
    await advance(NETWORK_MS)
    return { router, loaderCalls: () => loaderCalls }
  }

  it('does not reset the backoff on a cached Me before the network answers', async () => {
    // /api/uptime answers while /graphql keeps failing: each failure is a "blip".
    apiUp()
    const app = await renderSignedIn(request => (request === 1 ? signedIn() : fails()))
    expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()

    // Me is fetched again (any revalidation); the cached user renders, then the network fails.
    await act(async () => {
      await app.router.revalidate()
    })
    await advanceInSteps(NETWORK_MS)
    expect(app.loaderCalls()).toBe(2)

    // The first retry runs at once and fails again on the network; the next one waits out the
    // full backoff. The cached Me that renders on each retry must not reset it: when it did, the
    // retries kept coming every few milliseconds.
    await advanceInSteps(retryDelayMs(0) - 200)
    expect(app.loaderCalls()).toBe(3)
    await advanceInSteps(400)
    expect(app.loaderCalls()).toBe(4)
    await advanceInSteps(retryDelayMs(1) - 400)
    expect(app.loaderCalls()).toBe(4)
    await advanceInSteps(400)
    expect(app.loaderCalls()).toBe(5)
  })

  it('cancels a queued retry once the network answers Me', async () => {
    apiUp()
    let healthy = false
    const app = await renderSignedIn(() => (healthy ? signedIn() : fails()))
    await advanceInSteps(retryDelayMs(0) / 2)
    // The failure was retried at once, failed again, and the next retry is queued behind the
    // backoff.
    expect(app.loaderCalls()).toBe(2)

    // A navigation brings a healthy Me before the queued retry fires.
    healthy = true
    await act(async () => {
      await app.router.navigate('/?again=1')
    })
    await advance(NETWORK_MS)
    expect(screen.getByText('Signed in as user-1')).toBeInTheDocument()
    expect(app.loaderCalls()).toBe(3)

    // The queued retry no longer revalidates every loader after the recovery.
    await advance(retryDelayMs(3))
    expect(app.loaderCalls()).toBe(3)
  })
})
