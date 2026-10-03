import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import VerifyEmail from '../../../app/routes/_public/verify-email'
import ResendVerification from '../../../app/routes/_public/resend-verification'

// Mock Apollo Client
const mockUseMutation = vi.fn()
vi.mock('@apollo/client/react', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

// Mock SDK (for DocumentNode exports)
vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    VerifyEmail: { kind: 'Document', definitions: [] },
    VerifyEmailChange: { kind: 'Document', definitions: [] },
    ResendVerificationEmail: { kind: 'Document', definitions: [] },
  }
})

// Mock the AuthLayout component (+ Turnstile helpers the resend page now imports)
vi.mock('@nestled-template/web', () => ({
  AuthLayout: ({ children, title, subtitle }: any) => (
    <div data-testid="auth-layout">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
  TurnstileWidget: () => null,
  turnstileSiteKey: () => undefined,
}))

// Mock form theme
vi.mock('@nestled-template/shared/styles', () => ({
  formTheme: {},
}))

// Mock the Form component for ResendVerification
vi.mock('@nestledjs/forms', () => ({
  Form: ({ id, fields, submit }: any) => {
    const handleSubmit = e => {
      e.preventDefault()
      const formData = new FormData(e.target)
      const values: Record<string, any> = {}
      formData.forEach((value, key) => {
        values[key] = value
      })
      submit(values)
    }

    return (
      <form id={id} onSubmit={handleSubmit}>
        {fields?.map((field: any) => {
          if (!field) return null

          const { key, type, options } = field
          const { label, required, placeholder, text, disabled, loading } = options || {}

          if (type === 'button') {
            return (
              <button key={key} type={options?.type || 'button'} disabled={disabled || loading}>
                {text}
              </button>
            )
          }

          return (
            <div key={key}>
              <label htmlFor={key}>{label}</label>
              <input
                id={key}
                name={key}
                type={type}
                required={required}
                placeholder={placeholder}
              />
            </div>
          )
        })}
      </form>
    )
  },
}))

// Mock FormFieldClass from @nestledjs/forms-core
vi.mock('@nestledjs/forms-core', () => ({
  FormFieldClass: {
    email: (key: string, options: any) => ({ key, type: 'email', options }),
    button: (key: string, options: any) => ({ key, type: 'button', options }),
  },
}))

describe('Email Verification Tests', () => {
  describe('VerifyEmail Component', () => {
    let mockVerifyEmailMutation: ReturnType<typeof vi.fn>
    let mockVerifyEmailChangeMutation: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockVerifyEmailMutation = vi.fn().mockResolvedValue({ data: null })
      mockVerifyEmailChangeMutation = vi
        .fn()
        .mockRejectedValue(new Error('Email change verification failed'))

      // Clear and set up mocks
      mockUseMutation.mockReset()

      // Mock useMutation - will be called twice (VerifyEmailChange, VerifyEmail)
      let mutationCallCount = 0
      mockUseMutation.mockImplementation(() => {
        mutationCallCount++
        if (mutationCallCount % 2 === 1) {
          // Odd calls (1st): VerifyEmail
          return [mockVerifyEmailMutation, { loading: false }]
        } else {
          // Even calls (2nd): VerifyEmailChange
          return [mockVerifyEmailChangeMutation, { loading: false }]
        }
      })
    })

    const renderVerifyEmail = (token = 'valid-token-123', type?: 'initial' | 'change') => {
      const ReactRouterStub = createTestRouter([
        {
          path: '/verify-email',
          Component: VerifyEmail,
        },
      ])

      const url = token
        ? `/verify-email?token=${token}${type ? `&type=${type}` : ''}`
        : '/verify-email'
      return render(<ReactRouterStub initialEntries={[url]} />)
    }

    describe('Initial Render and Token Handling', () => {
      it('should render page title', () => {
        renderVerifyEmail()

        expect(screen.getByText('Email Verification')).toBeInTheDocument()
      })

      it('should show verifying message initially', () => {
        renderVerifyEmail()

        expect(screen.getByText('Verifying your email...', { exact: false })).toBeInTheDocument()
      })

      it('should render go to login link', () => {
        renderVerifyEmail()

        const loginLink = screen.getByText(/go to login/i)
        expect(loginLink).toBeInTheDocument()
        expect(loginLink.closest('a')).toHaveAttribute('href', '/login')
      })

      it('should display error when token is missing', () => {
        renderVerifyEmail('')

        expect(screen.getByText(/missing verification token/i)).toBeInTheDocument()
      })
    })

    describe('Email Change Verification Flow', () => {
      it('should use email change verification for typed email change links', async () => {
        mockVerifyEmailChangeMutation.mockResolvedValue({
          data: {
            verifyEmailChange: { id: 'user-123' },
          },
        })

        renderVerifyEmail('change-token-456', 'change')

        await waitFor(() => {
          expect(mockVerifyEmailChangeMutation).toHaveBeenCalledWith({
            variables: { token: 'change-token-456' },
          })
        })
      })

      it('should display success message for email change verification', async () => {
        mockVerifyEmailChangeMutation.mockResolvedValue({
          data: {
            verifyEmailChange: { id: 'user-123' },
          },
        })

        renderVerifyEmail('change-token-456', 'change')

        await waitFor(() => {
          expect(screen.getByText(/your email has been verified successfully/i)).toBeInTheDocument()
          expect(
            screen.getByText(/you can now log in with your new email address/i),
          ).toBeInTheDocument()
        })
      })

      it('should fall back to email change verification for older untyped links', async () => {
        mockVerifyEmailMutation.mockRejectedValue(new Error('Invalid token'))
        mockVerifyEmailChangeMutation.mockResolvedValue({
          data: {
            verifyEmailChange: { id: 'user-123' },
          },
        })

        renderVerifyEmail('change-token-456')

        await waitFor(() => {
          expect(mockVerifyEmailMutation).toHaveBeenCalledWith({
            variables: { input: { token: 'change-token-456' } },
          })
          expect(mockVerifyEmailChangeMutation).toHaveBeenCalledWith({
            variables: { token: 'change-token-456' },
          })
        })
      })

      it('should use initial verification directly for typed initial links', async () => {
        mockVerifyEmailMutation.mockResolvedValue({
          data: {
            verifyEmail: { id: 'user-123' },
          },
        })

        renderVerifyEmail('initial-token-789', 'initial')

        await waitFor(() => {
          expect(mockVerifyEmailMutation).toHaveBeenCalledWith({
            variables: { input: { token: 'initial-token-789' } },
          })
          expect(mockVerifyEmailChangeMutation).not.toHaveBeenCalled()
        })
      })
    })

    describe('Initial Email Verification Flow', () => {
      it('should verify initial email before fallback for untyped links', async () => {
        mockVerifyEmailMutation.mockResolvedValue({
          data: {
            verifyEmail: { id: 'user-456' },
          },
        })

        renderVerifyEmail()

        await waitFor(() => {
          expect(mockVerifyEmailMutation).toHaveBeenCalled()
        })
      })

      it('should display success message for initial email verification', async () => {
        mockVerifyEmailMutation.mockResolvedValue({
          data: {
            verifyEmail: { id: 'user-456' },
          },
        })

        renderVerifyEmail()

        await waitFor(() => {
          expect(screen.getByText(/your email has been verified/i)).toBeInTheDocument()
          expect(screen.getByText(/you can now log in/i)).toBeInTheDocument()
        })
      })

      it('should display error when initial verification returns no user', async () => {
        mockVerifyEmailMutation.mockResolvedValue({
          data: {
            verifyEmail: null,
          },
        })

        renderVerifyEmail('initial-token-789', 'initial')

        await waitFor(() => {
          expect(screen.getByText(/invalid or expired verification token/i)).toBeInTheDocument()
        })
      })

      it('should display error when both verifications fail', async () => {
        mockVerifyEmailMutation.mockRejectedValue(new Error('Token expired'))

        renderVerifyEmail('initial-token-789', 'initial')

        await waitFor(() => {
          expect(screen.getByText(/token expired/i)).toBeInTheDocument()
        })
      })
    })

    describe('Error States', () => {
      it('should handle expired token error', async () => {
        mockVerifyEmailChangeMutation.mockRejectedValue(new Error('Token expired'))
        mockVerifyEmailMutation.mockRejectedValue(new Error('Token expired'))

        renderVerifyEmail('change-token-456', 'change')

        await waitFor(() => {
          expect(screen.getByText(/token expired/i)).toBeInTheDocument()
        })
      })

      it('should handle invalid token error', async () => {
        mockVerifyEmailChangeMutation.mockRejectedValue(new Error('Invalid'))
        mockVerifyEmailMutation.mockRejectedValue(new Error('Invalid token'))

        renderVerifyEmail('initial-token-789', 'initial')

        await waitFor(() => {
          expect(screen.getByText(/invalid token/i)).toBeInTheDocument()
        })
      })

      it('should display generic error message when verification fails with no message', async () => {
        mockVerifyEmailChangeMutation.mockRejectedValue({})
        mockVerifyEmailMutation.mockRejectedValue({})

        renderVerifyEmail('initial-token-789', 'initial')

        await waitFor(() => {
          expect(screen.getByText(/invalid or expired verification token/i)).toBeInTheDocument()
        })
      })
    })
  })

  describe('ResendVerification Component', () => {
    let mockResendMutation: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockResendMutation = vi.fn()

      // Clear and set up mocks
      mockUseMutation.mockReset()

      // Mock useMutation for ResendVerificationEmail
      mockUseMutation.mockImplementation(() => [mockResendMutation, { loading: false }])
    })

    const renderResendVerification = () => {
      const ReactRouterStub = createTestRouter([
        {
          path: '/resend-verification',
          Component: ResendVerification,
        },
      ])

      return render(<ReactRouterStub initialEntries={['/resend-verification']} />)
    }

    describe('Form Rendering', () => {
      it('should render resend verification form', () => {
        renderResendVerification()

        expect(screen.getByLabelText('Email')).toBeInTheDocument()
        expect(
          screen.getByRole('button', { name: /resend verification email/i }),
        ).toBeInTheDocument()
      })

      it('should render page title and subtitle', () => {
        renderResendVerification()

        expect(screen.getByText('Resend Verification')).toBeInTheDocument()
        expect(
          screen.getByText(/enter your email to receive a new verification link/i),
        ).toBeInTheDocument()
      })

      it('should render back to login link', () => {
        renderResendVerification()

        const backLink = screen.getByText('Back to Login')
        expect(backLink).toBeInTheDocument()
        expect(backLink.closest('a')).toHaveAttribute('href', '/login')
      })

      it('should mark email field as required', () => {
        renderResendVerification()

        expect(screen.getByLabelText('Email')).toHaveAttribute('required')
      })
    })

    describe('Form Input', () => {
      it('should accept email input', async () => {
        const user = userEvent.setup()
        renderResendVerification()

        const emailInput = screen.getByLabelText('Email') as HTMLInputElement
        await user.type(emailInput, 'user@example.com')

        expect(emailInput.value).toBe('user@example.com')
      })

      it('should have email input type', () => {
        renderResendVerification()

        const emailInput = screen.getByLabelText('Email')
        expect(emailInput).toHaveAttribute('type', 'email')
      })
    })

    describe('Form Submission', () => {
      it('should call resend verification mutation with email', async () => {
        const user = userEvent.setup()
        mockResendMutation.mockResolvedValue({
          data: {
            resendVerificationEmail: true,
          },
        })

        renderResendVerification()

        await user.type(screen.getByLabelText('Email'), 'user@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(mockResendMutation).toHaveBeenCalledWith({
            variables: { email: 'user@example.com' },
          })
        })
      })

      it('should display success message on successful resend', async () => {
        const user = userEvent.setup()
        mockResendMutation.mockResolvedValue({
          data: {
            resendVerificationEmail: true,
          },
        })

        renderResendVerification()

        await user.type(screen.getByLabelText('Email'), 'user@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(screen.getByText(/verification email sent/i)).toBeInTheDocument()
          expect(screen.getByText(/please check your inbox/i)).toBeInTheDocument()
        })
      })

      it('should display error when resend returns false', async () => {
        const user = userEvent.setup()
        mockResendMutation.mockResolvedValue({
          data: {
            resendVerificationEmail: false,
          },
        })

        renderResendVerification()

        await user.type(screen.getByLabelText('Email'), 'user@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(screen.getByText(/unable to send verification email/i)).toBeInTheDocument()
        })
      })

      it('should display error on mutation failure', async () => {
        const user = userEvent.setup()
        mockResendMutation.mockRejectedValue(new Error('Email not found'))

        renderResendVerification()

        await user.type(screen.getByLabelText('Email'), 'nonexistent@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(screen.getByText('Email not found')).toBeInTheDocument()
        })
      })

      it('should display generic error when error has no message', async () => {
        const user = userEvent.setup()
        mockResendMutation.mockRejectedValue({})

        renderResendVerification()

        await user.type(screen.getByLabelText('Email'), 'user@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(screen.getByText('Something went wrong')).toBeInTheDocument()
        })
      })

      it('should clear previous message on new submission', async () => {
        const user = userEvent.setup()
        mockResendMutation
          .mockResolvedValueOnce({
            data: { resendVerificationEmail: false },
          })
          .mockResolvedValueOnce({
            data: { resendVerificationEmail: true },
          })

        renderResendVerification()

        // First submission - error
        await user.type(screen.getByLabelText('Email'), 'wrong@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(screen.getByText(/unable to send verification email/i)).toBeInTheDocument()
        })

        // Second submission - success
        await user.clear(screen.getByLabelText('Email'))
        await user.type(screen.getByLabelText('Email'), 'correct@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(screen.queryByText(/unable to send verification email/i)).not.toBeInTheDocument()
          expect(screen.getByText(/verification email sent/i)).toBeInTheDocument()
        })
      })
    })

    describe('Loading State', () => {
      function createMockResponse(isLoading: boolean) {
        return [mockResendMutation, { loading: isLoading }]
      }

      function setupLoadingMock(isLoading: boolean) {
        mockUseMutation.mockReset()
        mockUseMutation.mockImplementation(() => createMockResponse(isLoading))
      }

      it('should show loading text on button during submission', () => {
        setupLoadingMock(true)
        renderResendVerification()

        const submitButton = screen.getByRole('button', { name: /sending/i })
        expect(submitButton).toBeInTheDocument()
        expect(submitButton.textContent).toBe('Sending...')
        expect(submitButton).toBeDisabled()
      })

      it('should show normal button text when not loading', () => {
        setupLoadingMock(false)
        renderResendVerification()

        const submitButton = screen.getByRole('button', { name: /resend verification email/i })
        expect(submitButton).toBeInTheDocument()
        expect(submitButton).not.toBeDisabled()
      })
    })

    describe('Common Scenarios', () => {
      it('should handle email not found error', async () => {
        const user = userEvent.setup()
        mockResendMutation.mockRejectedValue(new Error('Email address not found'))

        renderResendVerification()

        await user.type(screen.getByLabelText('Email'), 'notfound@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(screen.getByText(/email address not found/i)).toBeInTheDocument()
        })
      })

      it('should allow multiple resend attempts', async () => {
        const user = userEvent.setup()
        mockResendMutation.mockResolvedValue({
          data: { resendVerificationEmail: true },
        })

        renderResendVerification()

        // First attempt
        await user.type(screen.getByLabelText('Email'), 'user1@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(mockResendMutation).toHaveBeenCalledTimes(1)
        })

        // Second attempt
        await user.clear(screen.getByLabelText('Email'))
        await user.type(screen.getByLabelText('Email'), 'user2@example.com')
        await user.click(screen.getByRole('button', { name: /resend verification email/i }))

        await waitFor(() => {
          expect(mockResendMutation).toHaveBeenCalledTimes(2)
        })
      })
    })
  })
})
