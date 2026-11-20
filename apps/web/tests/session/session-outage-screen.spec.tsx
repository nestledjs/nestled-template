import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, data, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retryDelayMs } from '../../app/api-availability'
import { OFFLINE_TITLE, SERVER_TROUBLE_TITLE } from '../../app/api-unavailable'
import { SessionOutageScreen, SessionUnknownScreen } from '../../app/session/session-unknown'

// The screen for an `unknown` verdict caused by an outage. The middleware remembers an outage for
// a short while, so a revalidation straight after the API answers can still come back unknown. The
// screen must keep revalidating with backoff until the verdict is known, and never reload.

async function renderScreen(probe: () => Promise<boolean>) {
  let loaderCalls = 0
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () => {
          loaderCalls += 1
          return {}
        },
        element: <SessionOutageScreen probe={probe} initialReason="server" />,
      },
    ],
    { initialEntries: ['/'] },
  )
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return { revalidations: () => loaderCalls - 1 }
}

// In steps, so React commits (and its effects schedule their timers) between them, as in a browser.
async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 500) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(500, ms - elapsed))
    })
  }
}

let reload: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  reload = vi.fn()
  vi.stubGlobal('location', { ...globalThis.location, reload })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SessionOutageScreen', () => {
  it('does not revalidate while the API is unreachable', async () => {
    const probe = vi.fn().mockResolvedValue(false)
    const { revalidations } = await renderScreen(probe)

    await advance(60_000)

    expect(probe).toHaveBeenCalled()
    expect(revalidations()).toBe(0)
    expect(screen.getByText(SERVER_TROUBLE_TITLE)).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('once the API answers, keeps revalidating with backoff while the verdict stays unknown', async () => {
    const probe = vi.fn().mockResolvedValue(true)
    const { revalidations } = await renderScreen(probe)

    // The first probe (after 2 s) answers; revalidations follow 2 s later, then 4 s, 8 s...
    await advance(retryDelayMs(0) * 2 + 50)
    const first = revalidations()
    expect(first).toBeGreaterThanOrEqual(1)

    await advance(retryDelayMs(1) + retryDelayMs(2) + retryDelayMs(3))
    expect(revalidations()).toBeGreaterThanOrEqual(first + 2)

    // Well past the 30 s outage memory and the one-minute reload limiter: still trying.
    const beforeLongWait = revalidations()
    await advance(120_000)
    expect(revalidations()).toBeGreaterThan(beforeLongWait)

    // The outage screen stays up meanwhile, and the page is never reloaded.
    expect(screen.getByText(SERVER_TROUBLE_TITLE)).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows the offline screen while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const probe = vi.fn().mockResolvedValue(false)
    const { revalidations } = await renderScreen(probe)

    await advance(10_000)

    expect(screen.getByText(OFFLINE_TITLE)).toBeInTheDocument()
    expect(revalidations()).toBe(0)
  })

  it.each([
    [
      'the outage screen',
      () => <SessionOutageScreen probe={async () => true} initialReason="server" />,
    ],
    ['the "couldn’t load your account" screen', () => <SessionUnknownScreen />],
  ])('%s gives way to the page once the loader recovers', async (_label, Screen) => {
    // A root loader that answers SESSION_UNKNOWN three times, then succeeds: the error boundary
    // must clear and the page render, with no reload.
    let calls = 0
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: async () => {
            calls += 1
            // A `.data` request takes time on the wire; a synchronous loader would hide the
            // revalidation's loading state, which the boundary needs to see to reset.
            await new Promise(resolve => setTimeout(resolve, 50))
            if (calls <= 3) throw data({ code: 'SESSION_UNKNOWN' }, { status: 503 })
            return { ok: true }
          },
          element: <p>the page</p>,
          ErrorBoundary: Screen,
        },
      ],
      { initialEntries: ['/'] },
    )
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    expect(screen.queryByText('the page')).not.toBeInTheDocument()

    await advance(60_000)

    expect(calls).toBe(4)
    expect(screen.getByText('the page')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()

    // And it stops: no revalidation keeps running behind the recovered page.
    await advance(120_000)
    expect(calls).toBe(4)
  })
})
