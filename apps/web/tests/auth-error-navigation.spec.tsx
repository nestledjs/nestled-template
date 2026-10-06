import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { APOLLO_ACCESS_FORBIDDEN_EVENT } from '@nestled-template/shared/apollo'
import { AccessDenied } from '../app/access-denied'
import { App } from '../app/app'
import { ErrorBoundary } from '../app/root'

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

    render(<MemoryRouter>{ErrorBoundary({ error: routeError })}</MemoryRouter>)

    expect(
      screen.getByRole('heading', { name: 'You don’t have permission to view this page' }),
    ).toBeInTheDocument()
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
