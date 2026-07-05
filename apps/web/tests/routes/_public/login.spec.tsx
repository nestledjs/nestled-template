import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginPage, { loader } from '../../../app/routes/_public/login'
import { useMutation } from '@apollo/client/react'
import { getCookie, getJsonCookie, isJwtExpired } from '@nestled-template/shared/utils'

// Mock only the essential external dependencies
vi.mock('@nestled-template/shared/utils', () => ({
  getCookie: vi.fn(),
  getJsonCookie: vi.fn(),
  getSessionCookieName: () => '__session',
  isJwtExpired: vi.fn(),
}))

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
}))

describe('Login Component', () => {
  let mockLoginMutation: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockLoginMutation = vi.fn()

    vi.mocked(useMutation).mockReturnValue([mockLoginMutation, { loading: false }] as any)
    vi.mocked(getCookie).mockReturnValue(null)
    vi.mocked(getJsonCookie).mockReturnValue(null)
    vi.mocked(isJwtExpired).mockReturnValue(false)
  })

  const renderLogin = (loaderData = {}) => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/login',
        Component: LoginPage,
        loader: () => loaderData,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/login']} />)
  }

  // Note: Component rendering tests are skipped due to complex dependency chain
  // (AuthLayout, Form from @nestledjs/forms, etc.) that would require extensive mocking.
  // Focus on loader function tests and E2E tests for UI validation.

  describe('Loader Function', () => {
    it('should redirect authenticated users to dashboard', async () => {
      vi.mocked(getCookie).mockReturnValue('valid-session-token')
      vi.mocked(isJwtExpired).mockReturnValue(false)

      const request = new Request('http://localhost/login')
      const args = { request, params: {}, context: {} } as any

      await expect(loader(args)).rejects.toThrow()
    })

    it('should not redirect when the token is expired', async () => {
      vi.mocked(getCookie).mockReturnValue('expired-session-token')
      vi.mocked(isJwtExpired).mockReturnValue(true)
      vi.mocked(getJsonCookie).mockReturnValue(null)

      const request = new Request('http://localhost/login')
      const args = { request, params: {}, context: {} } as any

      const result = await loader(args)
      expect(result).toEqual({})
    })

    it('should not redirect when the expired query param is present even with a valid cookie', async () => {
      vi.mocked(getCookie).mockReturnValue('valid-session-token')
      vi.mocked(isJwtExpired).mockReturnValue(false)
      vi.mocked(getJsonCookie).mockReturnValue(null)

      const request = new Request('http://localhost/login?expired=1')
      const args = { request, params: {}, context: {} } as any

      const result = await loader(args)
      expect(result).toEqual({})
    })

    it('should return remembered email data', async () => {
      vi.mocked(getCookie).mockReturnValue(null)
      vi.mocked(getJsonCookie).mockReturnValue({ email: 'remembered@example.com' })

      const request = new Request('http://localhost/login')
      const args = { request, params: {}, context: {} } as any

      const result = await loader(args)
      expect(result).toEqual({ email: 'remembered@example.com' })
    })

    it('should return empty object when no remembered data', async () => {
      vi.mocked(getCookie).mockReturnValue(null)
      vi.mocked(getJsonCookie).mockReturnValue(null)

      const request = new Request('http://localhost/login')
      const args = { request, params: {}, context: {} } as any

      const result = await loader(args)
      expect(result).toEqual({})
    })
  })
})
