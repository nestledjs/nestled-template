import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RequireAuth } from './require-auth'

describe('RequireAuth', () => {
  it('navigates to the login page exactly once when signed out', async () => {
    let releaseLogin: () => void = () => undefined
    const loginLoaderGate = new Promise<null>(resolve => {
      releaseLogin = () => resolve(null)
    })

    const router = createMemoryRouter(
      [
        {
          path: '/protected',
          loader: () => null,
          element: (
            <RequireAuth>
              <span>Secret</span>
            </RequireAuth>
          ),
        },
        // A pending loader keeps the redirect in the loading state, which is where
        // a fresh `state` object on every render used to restart the navigation.
        { path: '/login', loader: () => loginLoaderGate, element: <span>Login page</span> },
      ],
      { initialEntries: ['/protected'] },
    )

    const startedNavigations: string[] = []
    router.subscribe(state => {
      if (state.navigation.state === 'loading' && state.navigation.location) {
        const key = state.navigation.location.key
        if (!startedNavigations.includes(key)) startedNavigations.push(key)
        // A looping redirect never settles: stop the router so the test fails instead of hanging.
        if (startedNavigations.length > 3) router.dispose()
      }
    })

    render(<RouterProvider router={router} />)

    // Let several render/effect cycles run while the login loader is pending.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await Promise.resolve()
      })
    }

    await act(async () => {
      releaseLogin()
      await loginLoaderGate
    })

    expect(startedNavigations).toHaveLength(1)
    expect(await screen.findByText('Login page')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByText('Secret')).toBeNull()
  })

  it('renders its children when the loader provides a user', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/protected',
          loader: () => ({ user: { id: 'user-1' } }),
          element: (
            <RequireAuth>
              <span>Secret</span>
            </RequireAuth>
          ),
        },
      ],
      { initialEntries: ['/protected'] },
    )

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Secret')).toBeTruthy()
  })
})
