import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  UNSAFE_ErrorResponseImpl as ErrorResponseImpl,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_SERVICE_UNAVAILABLE_EVENT,
} from '@nestled-template/shared/apollo'
import { App } from '../app/app'
import { ErrorBoundary } from '../app/root'
import {
  CONFIRM_DELAYS_MS,
  probeApi,
  refetchFailedQueries,
  reloadForRecovery,
  retryDelayMs,
  trimTrailingSlashes,
  useApiAvailability,
  useRefetchFailedQueries,
} from '../app/api-availability'
import { ApolloProvider } from '@apollo/client/react'
import { CombinedGraphQLErrors } from '@apollo/client'
import { RecoveringApiUnavailable } from '../app/api-unavailable'

const CONFIRM_WINDOW_MS = CONFIRM_DELAYS_MS.reduce((total, delay) => total + delay, 0)
const SERVER_DOWN = 'Can’t reach the server'
const OFFLINE = 'You’re offline'

const fetchMock = vi.fn()

function apiUp() {
  fetchMock.mockResolvedValue(new Response('12.3', { status: 200 }))
}

function apiDown() {
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
    expect(
      screen.getByText('We can’t reach our servers right now. Retrying automatically…'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(CONFIRM_DELAYS_MS.length)
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
    const callsBefore = fetchMock.mock.calls.length

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(callsBefore + 1)

    apiUp()
    await act(async () => {
      globalThis.dispatchEvent(new Event('online'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(callsBefore + 2)
    expect(screen.getByText('Protected page')).toBeInTheDocument()
  })

  it('says the browser is offline when it is', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    apiDown()
    await renderApp()
    await reportOutage()
    await advance(CONFIRM_WINDOW_MS)

    expect(screen.getByRole('heading', { name: OFFLINE })).toBeInTheDocument()
    expect(
      screen.getByText('We’ll reconnect automatically when your connection is back.'),
    ).toBeInTheDocument()
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
