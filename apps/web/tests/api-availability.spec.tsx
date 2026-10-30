import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
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
  reloadForRecovery,
  retryDelayMs,
} from '../app/api-availability'
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
