import type { ReactNode } from 'react'
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

/**
 * Renders an element as the only route of a memory data router, the way the app renders the root
 * ErrorBoundary. Some of its branches use router hooks (`useRevalidator` for a 401, among them), so
 * a bare `render(<ErrorBoundary error={...} />)` throws "must be used within a data router" for
 * those errors. Returns the router, so a test can inspect or drive navigation.
 */
export function renderInDataRouter(element: ReactNode) {
  const router = createMemoryRouter([{ path: '/', element }], { initialEntries: ['/'] })
  act(() => {
    render(<RouterProvider router={router} />)
  })
  return router
}
