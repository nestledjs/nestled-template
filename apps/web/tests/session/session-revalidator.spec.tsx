import { act, render, screen } from '@testing-library/react'
import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  gql,
  InMemoryCache,
  Observable,
  ServerError,
} from '@apollo/client'
import { ApolloProvider, useMutation, useQuery } from '@apollo/client/react'
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
  retryUnauthenticatedQueries,
  SessionRevalidator,
} from '../../app/session/session-revalidator'

type BoundaryError = Parameters<typeof ErrorBoundary>[0]['error']

// The real timer, taken before any spec installs the fake ones.
const realSetTimeout = globalThis.setTimeout

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
  // No `shouldAdvanceTime`: real time passing under load would end the cooldown early. Specs advance
  // the clock themselves.
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SessionRevalidator: a browser 401 only triggers a revalidation', () => {
  it('is timed by the fake clock alone: real time passing never ends the cooldown', async () => {
    const before = Date.now()
    await act(async () => {
      await new Promise(resolve => realSetTimeout(resolve, 100))
    })
    expect(Date.now()).toBe(before)
  })

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

describe('SessionRevalidator: queries refused by a transient 401 are retried once the server confirms the session', () => {
  const ITEMS = gql`
    query Items {
      items {
        id
      }
    }
  `
  const ADMIN_ITEMS = gql`
    query AdminItems {
      adminItems {
        id
      }
    }
  `
  const SAVE = gql`
    mutation Save {
      save
    }
  `
  const UNAUTHENTICATED: ApolloLink.Result = {
    data: null,
    errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }],
  }
  const FORBIDDEN: ApolloLink.Result = {
    data: null,
    errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
  }
  const SIGNED_IN = { kind: 'signed-in', user: { id: 'user-1' } }

  type Answer = 'unauthenticated' | 'forbidden' | 'ok'
  /** An answer, or an answer that takes `delay` ms to arrive (default 5). */
  type Step = Answer | { answer: Answer; delay: number }

  /**
   * A client whose link answers each operation from its script (the last answer repeats), counts
   * the requests per operation, and, for a 401, dispatches the session suspect event as the app's
   * error link does.
   */
  function scriptedClient(scripts: Record<string, Step[]>) {
    const requests: Record<string, number> = {}
    const okResult: Record<string, unknown> = {
      Items: { items: [{ __typename: 'Item', id: 'item-1' }] },
      AdminItems: { adminItems: [{ __typename: 'Item', id: 'item-2' }] },
      Others: { others: [{ __typename: 'Other', id: 'other-1' }] },
      Save: { save: true },
    }
    const link = new ApolloLink(
      operation =>
        new Observable<ApolloLink.Result>(observer => {
          const name = operation.operationName ?? ''
          const index = requests[name] ?? 0
          requests[name] = index + 1
          const script = scripts[name] ?? ['ok']
          const step = script[Math.min(index, script.length - 1)]
          const { answer, delay } = typeof step === 'string' ? { answer: step, delay: 5 } : step
          // The API answers a moment later, as it does over the network.
          const timer = setTimeout(() => {
            if (answer === 'unauthenticated') {
              globalThis.dispatchEvent(new CustomEvent(APOLLO_SESSION_SUSPECT_EVENT))
              observer.next(UNAUTHENTICATED)
            } else if (answer === 'forbidden') {
              observer.next(FORBIDDEN)
            } else {
              observer.next({ data: okResult[name] as Record<string, unknown> })
            }
            observer.complete()
          }, delay)
          return () => clearTimeout(timer)
        }),
    )
    const client = new ApolloClient({ cache: new InMemoryCache(), link })
    return { client, requests: (name: string) => requests[name] ?? 0 }
  }

  function Items() {
    const { data, error } = useQuery<{ items: { id: string }[] }>(ITEMS)
    if (data) return <p>items: {data.items.length}</p>
    return <p>{error ? 'items failed' : 'items loading'}</p>
  }

  function AdminItems() {
    const { data, error } = useQuery<{ adminItems: { id: string }[] }>(ADMIN_ITEMS)
    if (data) return <p>admin items: {data.adminItems.length}</p>
    return <p>{error ? 'admin items failed' : 'admin items loading'}</p>
  }

  const OTHERS = gql`
    query Others {
      others {
        id
      }
    }
  `

  function Others() {
    const { data, error } = useQuery<{ others: { id: string }[] }>(OTHERS)
    if (data) return <p>others: {data.others.length}</p>
    return <p>{error ? 'others failed' : 'others loading'}</p>
  }

  function SaveButton() {
    const [save] = useMutation(SAVE)
    return (
      <button type="button" onClick={() => save().catch(() => undefined)}>
        save
      </button>
    )
  }

  /** Renders the revalidator and `children` under a root loader whose verdict `verdict()` gives. */
  async function renderApp(
    client: ApolloClient,
    verdict: () => unknown,
    children: React.ReactNode,
  ) {
    let loaderCalls = 0
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: async () => {
            loaderCalls += 1
            // The server judges the session over the network: it takes a moment.
            await new Promise(resolve => setTimeout(resolve, 20))
            return { session: loaderCalls === 1 ? SIGNED_IN : verdict() }
          },
          element: (
            <ApolloProvider client={client}>
              <SessionRevalidator />
              {children}
            </ApolloProvider>
          ),
        },
      ],
      { initialEntries: ['/'] },
    )
    await act(async () => {
      render(<RouterProvider router={router} />)
      await vi.advanceTimersByTimeAsync(30)
    })
    return { revalidations: () => loaderCalls - 1 }
  }

  async function settle(ms = 200) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it('refetches a query that got a 401 exactly once after a signed-in verdict, and no 403', async () => {
    const navigations = watchLocation()
    const { client, requests } = scriptedClient({
      Items: ['unauthenticated', 'ok'],
      AdminItems: ['forbidden'],
    })
    const { revalidations } = await renderApp(
      client,
      () => SIGNED_IN,
      <>
        <Items />
        <AdminItems />
      </>,
    )

    await settle()
    expect(revalidations()).toBe(1)
    expect(requests('Items')).toBe(2)
    expect(screen.getByText('items: 1')).toBeInTheDocument()
    // A 403 is not a session question: never retried here.
    expect(requests('AdminItems')).toBe(1)
    expect(screen.getByText('admin items failed')).toBeInTheDocument()

    await settle(SESSION_REVALIDATE_COOLDOWN_MS * 6)
    expect(requests('Items')).toBe(2)
    expect(requests('AdminItems')).toBe(1)
    expect(revalidations()).toBe(1)
    expect(navigations()).toEqual([])
  })

  it.each([
    ['rejected', { kind: 'signed-out', reason: 'rejected' }],
    ['unknown (outage)', { kind: 'unknown', reason: 'outage' }],
    ['unknown (answered error)', { kind: 'unknown', reason: 'answered-error' }],
  ])('refetches nothing after a %s verdict', async (_name, verdict) => {
    const { client, requests } = scriptedClient({ Items: ['unauthenticated', 'ok'] })
    const { revalidations } = await renderApp(client, () => verdict, <Items />)

    await settle(SESSION_REVALIDATE_COOLDOWN_MS * 6)
    expect(revalidations()).toBe(1)
    expect(requests('Items')).toBe(1)
    expect(screen.getByText('items failed')).toBeInTheDocument()
  })

  it('never replays a mutation that got a 401, while the query beside it is retried', async () => {
    const { client, requests } = scriptedClient({
      Items: ['unauthenticated', 'ok'],
      Save: ['unauthenticated', 'ok'],
    })
    const { revalidations } = await renderApp(
      client,
      () => SIGNED_IN,
      <>
        <Items />
        <SaveButton />
      </>,
    )
    await settle()
    expect(requests('Items')).toBe(2)

    // The cooldown has passed; the mutation's 401 starts a revalidation of its own.
    await settle(SESSION_REVALIDATE_COOLDOWN_MS)
    await act(async () => {
      screen.getByRole('button', { name: 'save' }).click()
    })
    await settle(SESSION_REVALIDATE_COOLDOWN_MS * 6)

    expect(revalidations()).toBe(2)
    expect(requests('Save')).toBe(1)
    expect(requests('Items')).toBe(2)
  })

  it('does not loop when the retry gets a 401 too: it only asks for one more revalidation', async () => {
    const navigations = watchLocation()
    const { client, requests } = scriptedClient({ Items: ['unauthenticated'] })
    const { revalidations } = await renderApp(client, () => SIGNED_IN, <Items />)

    await settle()
    expect(revalidations()).toBe(1)
    expect(requests('Items')).toBe(2)

    // The retry's 401 asked again, held for the cooldown; that revalidation retries nothing.
    await settle(SESSION_REVALIDATE_COOLDOWN_MS)
    expect(revalidations()).toBe(2)

    await settle(SESSION_REVALIDATE_COOLDOWN_MS * 10)
    expect(revalidations()).toBe(2)
    expect(requests('Items')).toBe(2)
    expect(screen.getByText('items failed')).toBeInTheDocument()
    expect(navigations()).toEqual([])
  })

  it('retries each of two overlapping 401s once, even when both retries get a 401 again', async () => {
    const { client, requests } = scriptedClient({
      Items: ['unauthenticated'],
      Others: ['unauthenticated'],
    })
    const { revalidations } = await renderApp(
      client,
      () => SIGNED_IN,
      <>
        <Items />
        <Others />
      </>,
    )

    await settle()
    expect(revalidations()).toBe(1)
    expect(requests('Items')).toBe(2)
    expect(requests('Others')).toBe(2)

    // The second initial 401 armed the revalidation held for the cooldown; it retries neither
    // query again, because each one's error is the one its own retry produced.
    await settle(SESSION_REVALIDATE_COOLDOWN_MS * 10)
    expect(revalidations()).toBe(2)
    expect(requests('Items')).toBe(2)
    expect(requests('Others')).toBe(2)
  })

  it("still retries a query whose first 401 arrives while another query's retry is in flight", async () => {
    const { client, requests } = scriptedClient({
      // The first query's retry is slow to answer...
      Items: ['unauthenticated', { answer: 'ok', delay: 500 }],
      // ...and the second query's first 401 lands while it is in flight.
      Others: [{ answer: 'unauthenticated', delay: 200 }, 'ok'],
    })
    const { revalidations } = await renderApp(
      client,
      () => SIGNED_IN,
      <>
        <Items />
        <Others />
      </>,
    )

    await settle(1_000)
    expect(revalidations()).toBe(1)
    expect(requests('Items')).toBe(2)
    expect(requests('Others')).toBe(1)
    expect(screen.getByText('items: 1')).toBeInTheDocument()

    await settle(SESSION_REVALIDATE_COOLDOWN_MS)
    expect(revalidations()).toBe(2)
    expect(requests('Others')).toBe(2)
    expect(screen.getByText('others: 1')).toBeInTheDocument()

    await settle(SESSION_REVALIDATE_COOLDOWN_MS * 6)
    expect(requests('Items')).toBe(2)
    expect(requests('Others')).toBe(2)
  })

  it('retries a query again after a later, separate 401, once its retry had succeeded', async () => {
    let error: unknown = new CombinedGraphQLErrors(UNAUTHENTICATED)
    let resolveRefetch: () => void = () => undefined
    const query = {
      getCurrentResult: () => ({ error }),
      refetch: vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolveRefetch = resolve
          }),
      ),
    }
    const client = { getObservableQueries: () => new Set([query]) }

    expect(retryUnauthenticatedQueries(client as never)).toBe(1)
    // In flight: not retried twice.
    expect(retryUnauthenticatedQueries(client as never)).toBe(0)

    error = undefined
    await act(async () => {
      resolveRefetch()
    })
    // Later the same query fails with a new 401: that one gets its retry too.
    error = new CombinedGraphQLErrors(UNAUTHENTICATED)
    expect(retryUnauthenticatedQueries(client as never)).toBe(1)
    expect(query.refetch).toHaveBeenCalledTimes(2)
  })

  it('retryUnauthenticatedQueries refetches only clean 401s: not a 403, an outage or a healthy query', () => {
    const query = (error?: unknown) => ({
      getCurrentResult: () => ({ error }),
      refetch: vi.fn().mockResolvedValue({}),
    })
    const graphQL401 = query(new CombinedGraphQLErrors(UNAUTHENTICATED))
    const http401 = query(
      new ServerError('Response not successful', {
        response: new Response(null, { status: 401 }),
        bodyText: '',
      }),
    )
    const forbidden = query(new CombinedGraphQLErrors(FORBIDDEN))
    // A 401 beside a 503 in the same answer is outage evidence: the connectivity refetch owns it.
    const outage = query(
      new CombinedGraphQLErrors({
        errors: [
          { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
          { message: 'Unavailable', extensions: { code: 'INTERNAL_SERVER_ERROR', status: 503 } },
        ],
      }),
    )
    const healthy = query()
    const client = {
      getObservableQueries: () => new Set([graphQL401, http401, forbidden, outage, healthy]),
    }

    expect(retryUnauthenticatedQueries(client as never)).toBe(2)
    expect(graphQL401.refetch).toHaveBeenCalledTimes(1)
    expect(http401.refetch).toHaveBeenCalledTimes(1)
    expect(forbidden.refetch).not.toHaveBeenCalled()
    expect(outage.refetch).not.toHaveBeenCalled()
    expect(healthy.refetch).not.toHaveBeenCalled()
  })
})
