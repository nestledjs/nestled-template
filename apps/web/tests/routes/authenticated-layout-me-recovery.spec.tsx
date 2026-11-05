import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
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
import { App } from '../../app/app'
import AuthenticatedLayout from '../../app/routes/_authenticated/_layout'
import { CONFIRM_DELAYS_MS, retryDelayMs } from '../../app/api-availability'

// The layout's chrome is not under test; only its "no user -> /force-logout" redirect is.
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
const SERVER_DOWN = 'Can’t reach the server'
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

async function renderMembersPage(meResponses: Respond[]) {
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
        path: '/',
        loader: async () => {
          rootLoaderCalls += 1
          const meQueryRef = preload(ME)
          await preload.toPromise(meQueryRef).catch(() => undefined)
          return { meQueryRef }
        },
        element: <App />,
        children: [
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
    { initialEntries: ['/members'] },
  )
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <RouterProvider router={router} />
      </ApolloProvider>,
    )
  })
  return { router, rootLoaderCalls: () => rootLoaderCalls }
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
