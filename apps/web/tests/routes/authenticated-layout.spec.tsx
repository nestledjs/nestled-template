import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloProvider, createQueryPreloader } from '@apollo/client/react'
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client'
import { MyOrganizationsWithMembers } from '@nestled-template/shared/sdk'
import { useGlobalCtx } from '@nestled-template/web'
import { App } from '../../app/app'
import AuthenticatedLayout, { middleware } from '../../app/routes/_authenticated/_layout'
import { requireSession } from '../../app/session/session-middleware.server'
import { SIGNED_IN, TEST_USER } from '../helpers/session-context'

// The signed-in layout under the real App. requireSession has judged the request before this
// layout's loader runs (session-middleware.spec covers every verdict through the request handler),
// so here the root loader returns a signed-in verdict and the layout only renders it.

vi.mock('@nestled-template/web-ui', () => ({
  WebUiHeader: ({ userName }: { userName?: string }) => <p>Header user: {userName}</p>,
  WebUiFooter: () => null,
}))
vi.mock('@nestled-template/web', async importOriginal => ({
  ...(await importOriginal<typeof import('@nestled-template/web')>()),
  SubscriptionProvider: ({ children }: { children: ReactNode }) => children,
  SubscriptionStatusBanner: () => null,
  EmulationBanner: () => null,
}))

const operations: string[] = []
// The organizations the page was given, one entry per render of it.
const givenOrganizations: unknown[] = []

function MembersPage() {
  givenOrganizations.push(useGlobalCtx().organizations)
  return <p>Members page</p>
}

function organizationsLink(organizations: unknown[] | null) {
  return new ApolloLink(
    operation =>
      new Observable<ApolloLink.Result>(observer => {
        operations.push(operation.operationName ?? '')
        observer.next({ data: { myOrganizations: organizations } })
        observer.complete()
      }),
  )
}

const ORGANIZATION = {
  __typename: 'Organization',
  id: 'org-1',
  name: 'First Org',
  slug: 'first-org',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  logo: null,
  members: [],
}

async function renderMembers(organizations: unknown[] | null = [ORGANIZATION]) {
  const client = new ApolloClient({
    link: organizationsLink(organizations),
    cache: new InMemoryCache(),
  })
  const preload = createQueryPreloader(client)
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        path: '/',
        loader: () => ({ session: SIGNED_IN, theme: 'light' }),
        element: <App />,
        children: [
          {
            path: 'members',
            loader: async () => {
              const myOrganizationsQueryRef = preload(MyOrganizationsWithMembers)
              await preload.toPromise(myOrganizationsQueryRef)
              return { myOrganizationsQueryRef }
            },
            element: <AuthenticatedLayout />,
            children: [{ index: true, element: <MembersPage /> }],
          },
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
  return router
}

beforeEach(() => {
  operations.length = 0
  givenOrganizations.length = 0
  localStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('the signed-in layout', () => {
  it('acts before its loader: requireSession is its only middleware', () => {
    expect(middleware).toEqual([requireSession])
  })

  it('renders the verdict’s user with no Me call of its own', async () => {
    await renderMembers()

    expect(await screen.findByText('Members page')).toBeInTheDocument()
    expect(
      screen.getByText(`Header user: ${TEST_USER.firstName} ${TEST_USER.lastName}`),
    ).toBeInTheDocument()
    expect(operations).not.toContain('Me')
  })

  it('keeps a user with no organizations signed in: an empty list is an answer, not a sign-out', async () => {
    await renderMembers([])

    expect(await screen.findByText('Members page')).toBeInTheDocument()
    expect(screen.getByText(/^Header user:/)).toBeInTheDocument()
  })

  it('gives the page the same empty list on every render when the answer holds none', async () => {
    const router = await renderMembers(null)
    expect(await screen.findByText('Members page')).toBeInTheDocument()

    // A new location renders the layout again.
    await act(async () => {
      await router.navigate('/members?tab=2')
    })

    expect(givenOrganizations.length).toBeGreaterThan(1)
    expect(givenOrganizations[0]).toEqual([])
    expect(new Set(givenOrganizations).size).toBe(1)
  })
})
