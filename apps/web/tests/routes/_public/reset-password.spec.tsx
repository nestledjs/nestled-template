import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ResetPassword from '../../../app/routes/_public/reset-password'
import { useMutation } from '@apollo/client/react'

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}))

// Mock the SDK mutation

// Mock the AuthLayout component
vi.mock('@nestled-template/web', () => ({
  AuthLayout: ({ children, title, subtitle }: any) => (
    <div data-testid="auth-layout">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}))

// Mock form theme
vi.mock('@nestled-template/shared/styles', () => ({
  formTheme: {},
}))

// Mock the Form component from @nestledjs/forms
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
          const {
            label,
            required,
            minLength,
            placeholder,
            helpText,
            text,
            disabled,
            fullWidth,
            loading,
          } = options || {}

          if (type === 'button') {
            return (
              <button
                key={key}
                type={options?.type || 'button'}
                disabled={disabled || loading}
                style={{ width: fullWidth ? '100%' : 'auto' }}
              >
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
                type={type === 'email' ? 'email' : type === 'password' ? 'password' : 'text'}
                required={required}
                minLength={minLength}
                placeholder={placeholder}
              />
              {helpText && <span>{helpText}</span>}
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
    text: (key: string, options: any) => ({ key, type: 'text', options }),
    email: (key: string, options: any) => ({ key, type: 'email', options }),
    password: (key: string, options: any) => ({ key, type: 'password', options }),
    button: (key: string, options: any) => ({ key, type: 'button', options }),
  },
}))

describe('ResetPassword Component', () => {
  let mockResetPasswordMutation: ReturnType<typeof vi.fn>
  let mockNavigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockResetPasswordMutation = vi.fn()
    mockNavigate = vi.fn()

    vi.mocked(useMutation).mockReturnValue([mockResetPasswordMutation, { loading: false }] as any)
  })

  const renderResetPassword = (token = 'valid-token-123') => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/reset-password',
        Component: ResetPassword,
      },
    ])

    const url = token ? `/reset-password?token=${token}` : '/reset-password'
    return render(<ReactRouterStub initialEntries={[url]} />)
  }

  describe('Form Rendering', () => {
    it('should render reset password form with password field', () => {
      renderResetPassword()

      expect(screen.getByLabelText('New Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
    })

    it('should render page title and subtitle', () => {
      renderResetPassword()

      expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeInTheDocument()
      expect(screen.getByText(/enter your new password/i)).toBeInTheDocument()
    })

    it('should render back to login link', () => {
      renderResetPassword()

      const backLink = screen.getByText('Back to Login')
      expect(backLink).toBeInTheDocument()
      expect(backLink.closest('a')).toHaveAttribute('href', '/login')
    })

    it('should show password requirements helper text', () => {
      renderResetPassword()

      expect(screen.getByText(/must be at least 8 characters/i)).toBeInTheDocument()
    })

    it('should mark password field as required', () => {
      renderResetPassword()

      expect(screen.getByLabelText('New Password')).toHaveAttribute('required')
    })
  })

  describe('Token Validation', () => {
    it('should display error when token is missing', () => {
      renderResetPassword('')

      expect(screen.getByText(/invalid or missing reset token/i)).toBeInTheDocument()
    })

    it('should disable submit button when token is missing', () => {
      renderResetPassword('')

      const submitButton = screen.getByRole('button', { name: /reset password/i })
      expect(submitButton).toBeDisabled()
    })

    it('should enable submit button when token is present', () => {
      renderResetPassword('valid-token-123')

      const submitButton = screen.getByRole('button', { name: /reset password/i })
      expect(submitButton).not.toBeDisabled()
    })
  })

  describe('Form Input', () => {
    it('should accept password input', async () => {
      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      const passwordInput = screen.getByLabelText('New Password') as HTMLInputElement
      await user.type(passwordInput, 'newPassword123')

      expect(passwordInput.value).toBe('newPassword123')
    })

    it('should have password input type for security', () => {
      renderResetPassword()

      const passwordInput = screen.getByLabelText('New Password')
      expect(passwordInput).toHaveAttribute('type', 'password')
    })
  })

  describe('Form Submission', () => {
    it('should call reset password mutation with token and new password', async () => {
      mockResetPasswordMutation.mockResolvedValue({
        data: {
          resetPassword: { id: 'user-123' },
        },
      })

      renderResetPassword('reset-token-456')
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newSecurePass123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(mockResetPasswordMutation).toHaveBeenCalledWith({
          variables: {
            input: {
              password: 'newSecurePass123',
              token: 'reset-token-456',
            },
          },
        })
      })
    })

    it('should display success message on successful password reset', async () => {
      mockResetPasswordMutation.mockResolvedValue({
        data: {
          resetPassword: { id: 'user-123' },
        },
      })

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText(/your password has been reset/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/redirecting to login/i)).toBeInTheDocument()
    })

    it('should display error when reset returns no user id', async () => {
      mockResetPasswordMutation.mockResolvedValue({
        data: {
          resetPassword: null,
        },
      })

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText(/unable to reset password/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/the token may have expired/i)).toBeInTheDocument()
    })

    it('should display error on mutation failure', async () => {
      mockResetPasswordMutation.mockRejectedValue(new Error('Invalid token'))

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText('Invalid token')).toBeInTheDocument()
      })
    })

    it('should display generic error when error has no message', async () => {
      mockResetPasswordMutation.mockRejectedValue({})

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      })
    })

    it('should clear previous message on new submission', async () => {
      mockResetPasswordMutation
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce({
          data: { resetPassword: { id: 'user-123' } },
        })

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      // First submission - error
      await user.type(screen.getByLabelText('New Password'), 'short')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument()
      })

      // Second submission - success
      await user.clear(screen.getByLabelText('New Password'))
      await user.type(screen.getByLabelText('New Password'), 'longerPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument()
        expect(screen.getByText(/your password has been reset/i)).toBeInTheDocument()
      })
    })

    it('should not submit when token is missing', async () => {
      renderResetPassword('')
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')

      const submitButton = screen.getByRole('button', { name: /reset password/i })
      expect(submitButton).toBeDisabled()

      // Even if user somehow triggers submit, mutation shouldn't be called
      expect(mockResetPasswordMutation).not.toHaveBeenCalled()
    })
  })

  describe('Loading State', () => {
    it('should show loading text on button during submission', () => {
      vi.mocked(useMutation).mockReturnValue([mockResetPasswordMutation, { loading: true }] as any)

      renderResetPassword()

      const submitButton = screen.getByRole('button', { name: /resetting/i })
      expect(submitButton).toBeInTheDocument()
      expect(submitButton.textContent).toBe('Resetting...')
      expect(submitButton).toBeDisabled()
    })

    it('should show normal button text when not loading', () => {
      vi.mocked(useMutation).mockReturnValue([mockResetPasswordMutation, { loading: false }] as any)

      renderResetPassword()

      const submitButton = screen.getByRole('button', { name: /reset password/i })
      expect(submitButton).toBeInTheDocument()
      expect(submitButton).not.toBeDisabled()
    })
  })

  describe('Message Display Styling', () => {
    it('should display success message with success styling', async () => {
      mockResetPasswordMutation.mockResolvedValue({
        data: { resetPassword: { id: 'user-123' } },
      })

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        const message = screen.getByText(/your password has been reset/i)
        const messageContainer = message.closest('div')
        expect(messageContainer?.className).toMatch(/emerald|success/i)
      })
    })

    it('should display error message with error styling', async () => {
      mockResetPasswordMutation.mockRejectedValue(new Error('Token expired'))

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        const message = screen.getByText(/token expired/i)
        const messageContainer = message.closest('div')
        expect(messageContainer?.className).toMatch(/rose|error/i)
      })
    })
  })

  describe('Common Scenarios', () => {
    it('should handle expired token error', async () => {
      mockResetPasswordMutation.mockRejectedValue(new Error('Reset token has expired'))

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText(/reset token has expired/i)).toBeInTheDocument()
      })
    })

    it('should handle password too weak error', async () => {
      mockResetPasswordMutation.mockRejectedValue(
        new Error('Password must be at least 8 characters'),
      )

      renderResetPassword()
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), '123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
      })
    })

    it('should handle successful reset with proper password', async () => {
      mockResetPasswordMutation.mockResolvedValue({
        data: {
          resetPassword: { id: 'user-456' },
        },
      })

      renderResetPassword('valid-token-789')
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'StrongPassword123!')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(mockResetPasswordMutation).toHaveBeenCalledWith({
          variables: {
            input: {
              password: 'StrongPassword123!',
              token: 'valid-token-789',
            },
          },
        })
      })

      expect(screen.getByText(/your password has been reset/i)).toBeInTheDocument()
    })

    it('should handle token from different URL formats', async () => {
      mockResetPasswordMutation.mockResolvedValue({
        data: { resetPassword: { id: 'user-123' } },
      })

      renderResetPassword('token-with-special-chars-123_456')
      const user = userEvent.setup({ delay: null })

      await user.type(screen.getByLabelText('New Password'), 'newPassword123')
      await user.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(mockResetPasswordMutation).toHaveBeenCalledWith({
          variables: {
            input: expect.objectContaining({
              token: 'token-with-special-chars-123_456',
            }),
          },
        })
      })
    })
  })
})
