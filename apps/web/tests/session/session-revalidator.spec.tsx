import { act, render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  data,
  RouterProvider,
  UNSAFE_ErrorResponseImpl as ErrorResponseImpl,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  API_UNAUTHENTICATED_CODE,
  APOLLO_SESSION_SUSPECT_EVENT,
  SESSION_REVALIDATE_COOLDOWN_MS,
} from '@nestled-template/shared/apollo'
import { ErrorBoundary } from '../../app/root'
import {
  __resetSessionRevalidation,
  requestSessionRevalidation,
  RevalidateSessionOnMount,
  SessionRevalidator,
} from '../../app/session/session-revalidator'

type BoundaryError = Parameters<typeof ErrorBoundary>[0]['error']

const SIGN_OUT_TARGET = /\/(login|logout|force-logout)/

/** Every way the browser could navigate, so a spec can prove it never does by itself. */
function watchLocation() {
  const assign = vi.fn()
  const replace = vi.fn()
  const hrefs: string[] = []
  const location = {
    ...globalThis.location,
    assign,
    replace,
    reload: vi.fn(),
    get href() {
      return 'http://localhost/members'
    },
    set href(value: string) {
      hrefs.push(value)
    },
  }
  vi.stubGlobal('location', location)
  return () => [
    ...assign.mock.calls.map(([to]) => to),
    ...replace.mock.calls.map(([to]) => to),
    ...hrefs,
  ]
}

async function renderWith(element: React.ReactNode) {
  let loaderCalls = 0
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () => {
          loaderCalls += 1
          return {}
        },
        element,
      },
    ],
    { initialEntries: ['/'] },
  )
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return { revalidations: () => loaderCalls - 1, router }
}

async function suspect(times = 1) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      globalThis.dispatchEvent(new CustomEvent(APOLLO_SESSION_SUSPECT_EVENT))
    }
  })
}

beforeEach(() => {
  __resetSessionRevalidation()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SessionRevalidator: a browser 401 only triggers a revalidation', () => {
  it('answers an error-link 401 with one revalidation', async () => {
    const navigations = watchLocation()
    const { revalidations } = await renderWith(<SessionRevalidator />)

    await suspect()

    expect(revalidations()).toBe(1)
    expect(navigations()).toEqual([])
  })

  it('answers five 401s within the cooldown with one revalidation now and one after it', async () => {
    const { revalidations } = await renderWith(<SessionRevalidator />)

    await suspect(5)
    expect(revalidations()).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS - 10)
    })
    expect(revalidations()).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    // The held suspicions are coalesced into one revalidation when the cooldown ends.
    expect(revalidations()).toBe(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS * 3)
    })
    expect(revalidations()).toBe(2)
  })

  it('keeps a 401 that arrives during the cooldown: a session revoked seconds later is still judged', async () => {
    const { revalidations } = await renderWith(<SessionRevalidator />)

    await suspect()
    expect(revalidations()).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    await suspect()
    expect(revalidations()).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS)
    })
    expect(revalidations()).toBe(2)
  })

  it('sends nothing while offline, and one revalidation once the browser reconnects', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const navigations = watchLocation()
    const { revalidations } = await renderWith(<SessionRevalidator />)

    await suspect(3)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS * 2)
    })
    expect(revalidations()).toBe(0)

    onLine.mockReturnValue(true)
    await act(async () => {
      globalThis.dispatchEvent(new Event('online'))
    })
    expect(revalidations()).toBe(1)

    await act(async () => {
      globalThis.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS * 2)
    })
    expect(revalidations()).toBe(1)
    expect(navigations()).toEqual([])
  })

  it('waits out the cooldown when the browser reconnects inside it', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get')
    const { revalidations } = await renderWith(<SessionRevalidator />)

    await suspect()
    expect(revalidations()).toBe(1)

    onLine.mockReturnValue(false)
    await suspect()
    onLine.mockReturnValue(true)
    await act(async () => {
      globalThis.dispatchEvent(new Event('online'))
    })
    expect(revalidations()).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS)
    })
    expect(revalidations()).toBe(2)
  })

  it('never touches location, whatever arrives', async () => {
    const navigations = watchLocation()
    await renderWith(<SessionRevalidator />)
    for (let round = 0; round < 3; round += 1) {
      await suspect(2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS)
      })
    }
    expect(navigations().filter(to => SIGN_OUT_TARGET.test(String(to)))).toEqual([])
    expect(navigations()).toEqual([])
  })

  it('requestSessionRevalidation reports whether it asked', () => {
    const revalidate = vi.fn()
    expect(requestSessionRevalidation(revalidate, 1_000)).toBe(true)
    expect(requestSessionRevalidation(revalidate, 1_001)).toBe(false)
    expect(requestSessionRevalidation(revalidate, 1_000 + SESSION_REVALIDATE_COOLDOWN_MS)).toBe(
      true,
    )
    expect(revalidate).toHaveBeenCalledTimes(2)
  })
})

describe('root ErrorBoundary with a route 401', () => {
  const route401 = new ErrorResponseImpl(401, 'Unauthorized', { code: API_UNAUTHENTICATED_CODE })

  it('revalidates once, then shows the route error screen with a retry; never signs out', async () => {
    const navigations = watchLocation()
    const { revalidations } = await renderWith(
      <ErrorBoundary error={route401 as unknown as BoundaryError} />,
    )

    expect(revalidations()).toBe(1)
    expect(screen.getByText('401')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(navigations()).toEqual([])
  })

  it('shares the cooldown with the error link: a 401 storm is one revalidation', async () => {
    const { revalidations } = await renderWith(
      <>
        <SessionRevalidator />
        <ErrorBoundary error={route401 as unknown as BoundaryError} />
      </>,
    )
    await suspect(3)
    expect(revalidations()).toBe(1)
  })

  it('treats any route 401 the same, whatever its message', async () => {
    const navigations = watchLocation()
    const { revalidations } = await renderWith(
      <ErrorBoundary
        error={new ErrorResponseImpl(401, 'Session expired', null) as unknown as BoundaryError}
      />,
    )
    expect(revalidations()).toBe(1)
    expect(navigations()).toEqual([])
  })

  it.each(['/settings', '/settings#security'])(
    'gives way to the page once the retry succeeds, even when it settles at once (%s)',
    async url => {
      let calls = 0
      const router = createMemoryRouter(
        [
          {
            path: '/settings',
            loader: () => {
              calls += 1
              if (calls === 1) throw data({ code: API_UNAUTHENTICATED_CODE }, { status: 401 })
              return {}
            },
            element: <p>the page</p>,
            ErrorBoundary: () => (
              <RevalidateSessionOnMount>
                <p>401 screen</p>
              </RevalidateSessionOnMount>
            ),
          },
        ],
        { initialEntries: [url] },
      )
      await act(async () => {
        render(<RouterProvider router={router} />)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(screen.getByText('the page')).toBeInTheDocument()
      // One failed load, one retry: no extra load to reset the boundary.
      expect(calls).toBe(2)
      expect(router.state.location).toMatchObject({
        pathname: '/settings',
        hash: new URL(url, 'http://localhost').hash,
      })
    },
  )

  it('a retry held through the cooldown runs as a plain revalidation once the user has left the error screen', async () => {
    let settingsCalls = 0
    let otherCalls = 0
    const router = createMemoryRouter(
      [
        {
          path: '/settings',
          loader: () => {
            settingsCalls += 1
            throw data({ code: API_UNAUTHENTICATED_CODE }, { status: 401 })
          },
          element: <p>settings</p>,
          ErrorBoundary: () => (
            <RevalidateSessionOnMount>
              <p>401 screen</p>
            </RevalidateSessionOnMount>
          ),
        },
        {
          path: '/other',
          loader: () => {
            otherCalls += 1
            return {}
          },
          element: <p>other page</p>,
        },
      ],
      { initialEntries: ['/settings'] },
    )
    // A revalidation just happened elsewhere, so the 401 screen's request is held for the cooldown.
    requestSessionRevalidation(() => undefined)
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    expect(screen.getByText('401 screen')).toBeInTheDocument()

    // The user leaves the error screen before the cooldown ends.
    await act(async () => {
      await router.navigate('/other')
    })
    expect(screen.getByText('other page')).toBeInTheDocument()
    const left = router.state.location
    const otherBefore = otherCalls

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_REVALIDATE_COOLDOWN_MS + 100)
    })

    // The held retry revalidated the page now showing, and did not navigate it.
    expect(otherCalls).toBe(otherBefore + 1)
    expect(router.state.location.key).toBe(left.key)
    expect(router.state.location.pathname).toBe('/other')
    expect(settingsCalls).toBe(1)
  })
})
