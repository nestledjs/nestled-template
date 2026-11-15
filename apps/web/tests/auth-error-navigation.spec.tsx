import { act, render, screen } from '@testing-library/react'
import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import {
  APOLLO_ACCESS_FORBIDDEN_EVENT,
  APOLLO_ORGANIZATION_REQUIRED_EVENT,
} from '@nestled-template/shared/apollo'
import { AccessDenied } from '../app/access-denied'
import { App } from '../app/app'
import { ErrorBoundary } from '../app/root'
import { ORGANIZATION_PICKER_TITLE } from '../app/organization-required'

/** A client whose `myOrganizations` answers one organization, for the organization picker. */
function organizationsClient() {
  const link = new ApolloLink(
    () =>
      new Observable<ApolloLink.Result>(observer => {
        observer.next({
          data: {
            myOrganizations: [
              {
                __typename: 'Organization',
                id: 'org-1',
                name: 'First Org',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                logo: null,
              },
            ],
          },
        })
        observer.complete()
      }),
  )
  return new ApolloClient({ link, cache: new InMemoryCache() })
}

/**
 * The root ErrorBoundary's own `error` prop type, whatever the app declares it as (`unknown` here;
 * an app may type it `Error`), so these tests compile against either.
 */
type BoundaryError = Parameters<typeof ErrorBoundary>[0]['error']
const boundaryError = (error: unknown) => error as BoundaryError

describe('authentication and authorization error navigation', () => {
  it('renders a clear access-denied page with a safe destination', () => {
    render(
      <MemoryRouter>
        <AccessDenied />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'You don’t have permission to view this page' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to dashboard' })).toHaveAttribute(
      'href',
      '/members/dashboard',
    )
  })

  it('renders access denied for a route-level 403 response', () => {
    const routeError = {
      status: 403,
      statusText: 'Forbidden',
      internal: false,
      data: null,
    }

    render(<MemoryRouter>{ErrorBoundary({ error: boundaryError(routeError) })}</MemoryRouter>)

    expect(
      screen.getByRole('heading', { name: 'You don’t have permission to view this page' }),
    ).toBeInTheDocument()
  })

  it('keeps the session and shows the organization picker for ORGANIZATION_CONTEXT_REQUIRED', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...globalThis.location, assign })
    try {
      const error = new CombinedGraphQLErrors({
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
      })

      render(
        <ApolloProvider client={organizationsClient()}>
          <MemoryRouter>{ErrorBoundary({ error: boundaryError(error) })}</MemoryRouter>
        </ApolloProvider>,
      )

      expect(await screen.findByRole('heading', { name: ORGANIZATION_PICKER_TITLE })).toBeVisible()
      expect(screen.getByRole('button', { name: 'First Org' })).toBeVisible()
      expect(assign).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('replaces the page with the organization picker after an organization-required event', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: () => ({}),
          element: <App />,
          children: [{ index: true, element: <p>Protected page</p> }],
        },
      ],
      { initialEntries: ['/'] },
    )
    await act(async () => {
      render(
        <ApolloProvider client={organizationsClient()}>
          <RouterProvider router={router} />
        </ApolloProvider>,
      )
    })
    expect(screen.getByText('Protected page')).toBeInTheDocument()

    // What the error link dispatches for a query (currentSubscriptionActive, say) refused with
    // ORGANIZATION_CONTEXT_REQUIRED.
    await act(async () => {
      globalThis.dispatchEvent(new CustomEvent(APOLLO_ORGANIZATION_REQUIRED_EVENT))
    })

    expect(await screen.findByRole('heading', { name: ORGANIZATION_PICKER_TITLE })).toBeVisible()
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument()
  })

  it('replaces a protected query page with access denied after a forbidden event', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: () => ({}),
          element: <App />,
          children: [{ index: true, element: <p>Protected page</p> }],
        },
      ],
      { initialEntries: ['/'] },
    )
    // Router initialization resolves the loader asynchronously. Finish the initial mount and
    // App's effects before dispatching: visible outlet content alone does not prove that the
    // global event listener is installed or that the navigation-reset effect has completed.
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    expect(screen.getByText('Protected page')).toBeInTheDocument()

    await act(async () => {
      globalThis.dispatchEvent(new CustomEvent(APOLLO_ACCESS_FORBIDDEN_EVENT))
    })

    expect(
      screen.getByRole('heading', { name: 'You don’t have permission to view this page' }),
    ).toBeInTheDocument()
  })
})
