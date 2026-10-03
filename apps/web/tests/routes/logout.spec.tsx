import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LogoutRoute from '../../app/routes/logout'
import { ApolloClient } from '@apollo/client'
import Cookies from 'js-cookie'
import { createTestRouter } from '../helpers/createTestRouter'

import { useApolloClient } from '@apollo/client/react'

// Mock dependencies
vi.mock('@apollo/client/react', () => ({
  useApolloClient: vi.fn(),
}))

vi.mock('js-cookie', () => ({
  default: {
    remove: vi.fn(),
  },
}))

vi.mock('@nestled-template/web-ui', () => ({
  WebUiLoading: () => <div data-testid="loading-spinner">Loading...</div>,
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Extract renderLogout helper to reduce nesting depth
function createLogoutRender() {
  const ReactRouterStub = createTestRouter([
    {
      path: '/logout',
      Component: LogoutRoute,
    },
    {
      path: '/login',
      element: <div data-testid="login-page">Login Page</div>,
    },
  ])

  return render(<ReactRouterStub initialEntries={['/logout']} />)
}

describe('Logout Route', () => {
  let mockApolloClient: {
    mutate: ReturnType<typeof vi.fn>
    clearStore: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockApolloClient = {
      mutate: vi.fn(),
      clearStore: vi.fn(),
      stop: vi.fn(),
    }

    vi.mocked(useApolloClient).mockReturnValue(mockApolloClient as any)

    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'warn').mockImplementation(() => {
      // No-op for test
    })
  })

  const renderLogout = createLogoutRender

  describe('Loading State', () => {
    it('should show loading spinner immediately', () => {
      // Create a never-resolving promise to test loading state
      const neverResolvingPromise = new Promise(() => {
        // Intentionally never resolves
      })
      mockApolloClient.mutate.mockImplementation(() => neverResolvingPromise)

      renderLogout()

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('Logout Flow', () => {
    it('should call logout mutation', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockApolloClient.mutate).toHaveBeenCalledWith({
          mutation: expect.objectContaining({
            kind: 'Document',
          }),
        })
      })
    })

    it('should clear Apollo store after logout mutation', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockApolloClient.clearStore).toHaveBeenCalled()
      })
    })

    it('should execute mutation before clearing store', async () => {
      const callOrder: string[] = []

      mockApolloClient.mutate.mockImplementation(async () => {
        callOrder.push('mutate')
        return { data: { logout: true } }
      })

      mockApolloClient.clearStore.mockImplementation(async () => {
        callOrder.push('clearStore')
        return []
      })

      renderLogout()

      await waitFor(() => {
        expect(callOrder).toEqual(['mutate', 'clearStore'])
      })
    })
  })

  describe('Cookie Cleanup', () => {
    it('should remove client-side cookies', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(Cookies.remove).toHaveBeenCalledWith('__user')
        expect(Cookies.remove).toHaveBeenCalledWith('__leaderChapter')
        expect(Cookies.remove).toHaveBeenCalledWith('__originalUser')
      })
    })

    it('should remove all specified cookies', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(Cookies.remove).toHaveBeenCalledTimes(3)
      })
    })

    it('should handle cookie removal errors gracefully', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])
      vi.mocked(Cookies.remove).mockImplementation(() => {
        throw new Error('Cookie removal failed')
      })

      renderLogout()

      // Should still navigate even if cookie removal fails
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })
  })

  describe('Navigation', () => {
    it('should redirect to login page after successful logout', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })

    it('should use replace: true for navigation', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })
  })

  describe('Error Handling - Mutation Failure', () => {
    it('should continue logout even if mutation fails', async () => {
      mockApolloClient.mutate.mockRejectedValue(new Error('Network error'))
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockApolloClient.clearStore).toHaveBeenCalled()
      })
    })

    it('should still clear store after mutation error', async () => {
      mockApolloClient.mutate.mockRejectedValue(new Error('Server error'))
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockApolloClient.clearStore).toHaveBeenCalled()
      })
    })

    it('should navigate to login after mutation error', async () => {
      mockApolloClient.mutate.mockRejectedValue(new Error('Auth error'))
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })

    it('should log warning for mutation failure', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn')
      mockApolloClient.mutate.mockRejectedValue(new Error('Connection failed'))
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[logout] logoutMutation failed (continuing):',
          'Connection failed',
        )
      })
    })
  })

  describe('Error Handling - ClearStore Failure', () => {
    it('should navigate to login even if clearStore fails', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockRejectedValue(new Error('Cache clear failed'))

      renderLogout()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })

    it('should log warning for clearStore failure', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn')
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockRejectedValue(new Error('Cache error'))

      renderLogout()

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[logout] apollo.clearStore failed (continuing):',
          'Cache error',
        )
      })
    })
  })

  describe('Error Handling - Complete Failure', () => {
    it('should navigate to login even if entire process fails', async () => {
      mockApolloClient.mutate.mockRejectedValue(new Error('Complete failure'))
      mockApolloClient.clearStore.mockRejectedValue(new Error('Complete failure'))

      renderLogout()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })

    it('should handle synchronous errors in doLogout', async () => {
      mockApolloClient.mutate.mockImplementation(() => {
        throw new Error('Sync error')
      })

      renderLogout()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })
  })

  describe('Session Cleanup Order', () => {
    it('should execute cleanup steps in correct order', async () => {
      const steps: string[] = []

      vi.mocked(Cookies.remove).mockImplementation((name: string) => {
        steps.push(`1-cookie-${name}`)
      })

      mockApolloClient.mutate.mockImplementation(async () => {
        steps.push('2-mutation')
        return { data: { logout: true } }
      })

      mockApolloClient.stop.mockImplementation(() => {
        steps.push('3-stop')
      })

      mockApolloClient.clearStore.mockImplementation(async () => {
        steps.push('4-clearStore')
        return []
      })

      renderLogout()

      await waitFor(() => {
        expect(steps[0]).toContain('1-cookie')
        expect(steps[3]).toBe('2-mutation')
        expect(steps[4]).toBe('3-stop')
        expect(steps[5]).toBe('4-clearStore')
      })
    })
  })

  describe('Component Lifecycle', () => {
    it('should execute logout in useEffect on mount', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockApolloClient.mutate).toHaveBeenCalled()
      })
    })

    it('should only execute logout once', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockApolloClient.mutate).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Security', () => {
    it('should clear all authentication data', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        // Server-side logout
        expect(mockApolloClient.mutate).toHaveBeenCalled()

        // Client cache cleared
        expect(mockApolloClient.clearStore).toHaveBeenCalled()

        // Client cookies cleared
        expect(Cookies.remove).toHaveBeenCalledWith('__user')
        expect(Cookies.remove).toHaveBeenCalledWith('__leaderChapter')
        expect(Cookies.remove).toHaveBeenCalledWith('__originalUser')
      })
    })

    it('should call server logout to invalidate httpOnly session cookie', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockApolloClient.mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            mutation: expect.any(Object),
          }),
        )
      })
    })
  })

  describe('User Experience', () => {
    it('should show loading state throughout logout process', async () => {
      let resolveLogout: any
      mockApolloClient.mutate.mockReturnValue(
        new Promise(resolve => {
          resolveLogout = resolve
        }),
      )

      renderLogout()

      // Should show loading immediately
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

      // Resolve logout
      resolveLogout({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      // Will navigate away after completion
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })
  })

  describe('Redirect Path', () => {
    it('should always redirect to /login path', async () => {
      mockApolloClient.mutate.mockResolvedValue({ data: { logout: true } })
      mockApolloClient.clearStore.mockResolvedValue([])

      renderLogout()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
      })
    })
  })
})
