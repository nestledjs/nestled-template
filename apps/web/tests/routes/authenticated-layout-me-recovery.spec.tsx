import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloProvider, createQueryPreloader } from '@apollo/client/react'
import {
  ApolloClient,
  ApolloLink,
  gql,
  InMemoryCache,
  Observable,
  ServerError,
} from '@apollo/client'
import { MyOrganizationsWithMembers } from '@nestled-template/shared/sdk'
import { GlobalContextProvider } from '@nestled-template/web'
import { clearApiOutage, signalApiOutage } from '@nestled-template/shared/apollo'
import { sessionRecheckOutcome } from '../../app/session-recheck'
import { App } from '../../app/app'
import AuthenticatedLayout from '../../app/routes/_authenticated/_layout'
import { CONFIRM_DELAYS_MS, retryDelayMs } from '../../app/api-availability'
import { SERVER_TROUBLE_TITLE } from '../../app/api-unavailable'
import { NO_ORGANIZATIONS_TITLE } from '../../app/organization-required'

// The layout's chrome is not under test; only what it does with no user is.
vi.mock('@nestled-template/web-ui', () => ({
  WebUiHeader: () => null,
  WebUiFooter: () => null,
}))
vi.mock('@nestled-template/web', async importOriginal => ({
  ...(await importOriginal<typeof import('@nestled-template/web')>()),
  SubscriptionProvider: ({ children }: { children: ReactNode }) => children,
  SubscriptionStatusBanner: () => null,
  EmulationBanner: () => null,
}))

const ME = gql`
  query Me {
    me {
      id
    }
  }
`

const CONFIRM_WINDOW_MS = CONFIRM_DELAYS_MS.reduce((total, delay) => total + delay, 0)
const SERVER_DOWN = SERVER_TROUBLE_TITLE
const fetchMock = vi.fn()

type Respond = () => Observable<ApolloLink.Result>

const fails = (error: Error) => () => new Observable<ApolloLink.Result>(o => o.error(error))
const signedIn = () =>
  new Observable<ApolloLink.Result>(o => {
    o.next({ data: { me: { __typename: 'User', id: 'user-1' } } })
    o.complete()
  })
const noOrganizations = () =>
  new Observable<ApolloLink.Result>(o => {
    o.next({ data: { myOrganizations: [] } })
    o.complete()
  })

async function renderMembersPage(
  meResponses: Respond[],
  {
    rootPreloadsMe = true,
    initialPath = '/members',
    rootFlagsOutage = false,
  }: {
    // False: the root loader returns no Me query, as after a Me preload on a public route that
    // failed for a reason other than the API (the cookie is kept), or with no preload at all.
    rootPreloadsMe?: boolean
    initialPath?: string
    // The root loader returns its outage flag (`serviceUnavailable`) and the root renders the
    // routes anyway, as in an app whose root does not put up the outage screen for it.
    rootFlagsOutage?: boolean
  } = {},
) {
  let meRequests = 0
  const link = new ApolloLink(operation => {
    if (operation.operationName !== 'Me') return noOrganizations()
    const respond = meResponses[Math.min(meRequests, meResponses.length - 1)]
    meRequests += 1
    return respond()
  })
  const client = new ApolloClient({ link, cache: new InMemoryCache() })
  const preload = createQueryPreloader(client)
  let rootLoaderCalls = 0
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        path: '/',
        loader: async () => {
          rootLoaderCalls += 1
          if (rootFlagsOutage) return { serviceUnavailable: true }
          if (!rootPreloadsMe) return {}
          const meQueryRef = preload(ME)
          await preload.toPromise(meQueryRef).catch(() => undefined)
          return { meQueryRef }
        },
        element: rootFlagsOutage ? (
          <GlobalContextProvider user={null}>
            <Outlet />
          </GlobalContextProvider>
        ) : (
          <App />
        ),
        children: [
          { index: true, element: <p>Public home</p> },
          {
            path: 'members',
            loader: async () => {
              const myOrganizationsQueryRef = preload(MyOrganizationsWithMembers, {
                fetchPolicy: 'network-only',
              })
              await preload.toPromise(myOrganizationsQueryRef)
              return { myOrganizationsQueryRef }
            },
            element: <AuthenticatedLayout />,
            children: [{ index: true, element: <p>Members page</p> }],
          },
          { path: 'force-logout', element: <p>Force logout page</p> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <RouterProvider router={router} />
      </ApolloProvider>,
    )
  })
  return { router, rootLoaderCalls: () => rootLoaderCalls, meRequests: () => meRequests }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('authenticated layout when the Me query fails', () => {
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

  it('waits on a connectivity failure instead of logging out, then signs the user back in', async () => {
    fetchMock.mockResolvedValue(new Response('12.3', { status: 200 }))
    const app = await renderMembersPage([fails(new TypeError('Failed to fetch')), signedIn])

    // While the retry is pending the signed-out outlet is not mounted, so nothing redirects.
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()
    expect(screen.queryByText('Force logout page')).not.toBeInTheDocument()
    expect(app.router.state.location.pathname).toBe('/members')

    await advance(CONFIRM_WINDOW_MS)

    expect(app.rootLoaderCalls()).toBe(2)
    expect(app.router.state.location.pathname).toBe('/members')
    expect(screen.getByText('Members page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: SERVER_DOWN })).not.toBeInTheDocument()
  })

  it('still sends a 401 through /force-logout', async () => {
    fetchMock.mockResolvedValue(new Response('12.3', { status: 200 }))
    const unauthorized = new ServerError('Response not successful', {
      response: new Response(null, { status: 401 }),
      bodyText: '',
    })
    const app = await renderMembersPage([fails(unauthorized)])
    await advance(CONFIRM_WINDOW_MS + retryDelayMs(3))

    expect(app.router.state.location.pathname).toBe('/force-logout')
    expect(app.router.state.location.search).toBe(`?return_url=${encodeURIComponent('/members')}`)
    expect(screen.getByText('Force logout page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: SERVER_DOWN })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('authenticated layout with no user', () => {
  const unauthorized = () =>
    new ServerError('Response not successful', {
      response: new Response(null, { status: 401 }),
      bodyText: '',
    })
  const serverError = () =>
    new ServerError('Response not successful', {
      response: new Response(null, { status: 500 }),
      bodyText: '',
    })

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

  it('asks Me again instead of logging out, and renders the user it gets', async () => {
    const app = await renderMembersPage([signedIn], { rootPreloadsMe: false })
    await advance(0)

    expect(app.meRequests()).toBe(1)
    expect(screen.getByText('Members page')).toBeInTheDocument()
    expect(screen.queryByText('Force logout page')).not.toBeInTheDocument()
    expect(app.router.state.location.pathname).toBe('/members')
  })

  it('shows the organization picker, with no logout and no retry loop, when Me again gets ORGANIZATION_CONTEXT_REQUIRED', async () => {
    const organizationRequired = () =>
      new Observable<ApolloLink.Result>(o => {
        o.next({
          data: null,
          errors: [
            {
              message: 'Organization context required.',
              extensions: {
                code: 'ORGANIZATION_CONTEXT_REQUIRED',
                originalError: { statusCode: 403, code: 'ORGANIZATION_CONTEXT_REQUIRED' },
              },
            },
          ],
        } as never)
        o.complete()
      })
    const app = await renderMembersPage([organizationRequired], { rootPreloadsMe: false })
    await advance(0)

    // The link answers `myOrganizations` with none, so the picker says so and offers sign-out.
    expect(screen.getByRole('heading', { name: NO_ORGANIZATIONS_TITLE })).toBeInTheDocument()
    expect(app.router.state.location.pathname).toBe('/members')
    expect(screen.queryByText('Force logout page')).not.toBeInTheDocument()

    await advance(retryDelayMs(0) + retryDelayMs(1) + retryDelayMs(2))
    expect(app.meRequests()).toBe(1)
    expect(app.router.state.location.pathname).toBe('/members')
  })

  it('logs out when Me again gets a real 401 with no outage', async () => {
    const app = await renderMembersPage([fails(unauthorized())], { rootPreloadsMe: false })
    await advance(0)

    expect(app.meRequests()).toBe(1)
    expect(app.router.state.location.pathname).toBe('/force-logout')
    expect(app.router.state.location.search).toBe(`?return_url=${encodeURIComponent('/members')}`)
  })

  it('keeps the session on any other failure, retrying Me with backoff until it answers', async () => {
    const app = await renderMembersPage(
      [fails(new TypeError('Failed to fetch')), fails(serverError()), signedIn],
      { rootPreloadsMe: false },
    )
    await advance(0)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    await advance(retryDelayMs(0))
    expect(app.meRequests()).toBe(2)
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    await advance(retryDelayMs(1))
    expect(app.meRequests()).toBe(3)
    expect(screen.getByText('Members page')).toBeInTheDocument()
    expect(app.router.state.location.pathname).toBe('/members')
  })

  it('keeps the session on a 401 while the app has outage evidence', async () => {
    const outage = {}
    signalApiOutage(outage)
    try {
      const app = await renderMembersPage([fails(unauthorized()), signedIn], {
        rootPreloadsMe: false,
      })
      await advance(0)
      expect(app.router.state.location.pathname).toBe('/members')
      expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

      clearApiOutage(outage)
      await advance(retryDelayMs(0))
      expect(screen.getByText('Members page')).toBeInTheDocument()
    } finally {
      clearApiOutage(outage)
    }
  })

  it("keeps the session on a 401 while the root loader's outage flag stands", async () => {
    // Nothing signals an outage in the browser here: only the root loader's flag says the API was
    // unreachable, and it outranks the re-check's 401.
    const app = await renderMembersPage([fails(unauthorized()), signedIn], {
      rootFlagsOutage: true,
    })
    await advance(0)

    expect(app.meRequests()).toBe(1)
    expect(app.router.state.location.pathname).toBe('/members')
    expect(screen.getByRole('heading', { name: SERVER_DOWN })).toBeInTheDocument()

    await advance(retryDelayMs(0))
    expect(app.meRequests()).toBe(2)
    expect(screen.getByText('Members page')).toBeInTheDocument()
  })

  it("judges the re-check's 401 as a rejection only with no loader outage flag", () => {
    const error = unauthorized()
    expect(sessionRecheckOutcome({ error })).toBe('rejected')
    expect(sessionRecheckOutcome({ error }, false)).toBe('rejected')
    expect(sessionRecheckOutcome({ error }, true)).toBe('retry')
  })

  describe('after a public route whose Me preload failed, with the cookie kept', () => {
    // The root loader does not run again on a client-side navigation into the signed-in area, so
    // the user stays null there unless the layout asks Me itself.
    async function navigateToMembers(meResponses: Respond[]) {
      const app = await renderMembersPage(meResponses, {
        rootPreloadsMe: false,
        initialPath: '/',
      })
      expect(screen.getByText('Public home')).toBeInTheDocument()
      await act(async () => {
        await app.router.navigate('/members')
      })
      await advance(0)
      return app
    }

    it('runs Me again on the private route and keeps the user signed in', async () => {
      const app = await navigateToMembers([signedIn])

      expect(app.rootLoaderCalls()).toBe(1)
      expect(app.meRequests()).toBe(1)
      expect(screen.getByText('Members page')).toBeInTheDocument()
      expect(app.router.state.location.pathname).toBe('/members')
    })

    it('logs out only when that Me gets a real 401', async () => {
      const app = await navigateToMembers([fails(unauthorized())])

      expect(app.meRequests()).toBe(1)
      expect(app.router.state.location.pathname).toBe('/force-logout')
    })
  })
})
