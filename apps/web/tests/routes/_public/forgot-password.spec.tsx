import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ForgotPassword from '../../../app/routes/_public/forgot-password'
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

describe('ForgotPassword Component', () => {
  let mockForgotPasswordMutation: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockForgotPasswordMutation = vi.fn()

    vi.mocked(useMutation).mockReturnValue([mockForgotPasswordMutation, { loading: false }] as any)
  })

  const renderForgotPassword = () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/forgot-password',
        Component: ForgotPassword,
      },
    ])

    return render(<ReactRouterStub initialEntries={['/forgot-password']} />)
  }

  describe('Form Rendering', () => {
    it('should render forgot password form with email field', () => {
      renderForgotPassword()

      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /request password reset/i })).toBeInTheDocument()
    })

    it('should render page title and subtitle', () => {
      renderForgotPassword()

      expect(screen.getByText('Forgot Your Password?')).toBeInTheDocument()
      expect(screen.getByText(/enter your email to request a password reset/i)).toBeInTheDocument()
    })

    it('should render back to login link', () => {
      renderForgotPassword()

      const backLink = screen.getByText('Back to Login')
      expect(backLink).toBeInTheDocument()
      expect(backLink.closest('a')).toHaveAttribute('href', '/login')
    })

    it('should mark email field as required', () => {
      renderForgotPassword()

      expect(screen.getByLabelText('Email')).toHaveAttribute('required')
    })
  })

  describe('Form Input', () => {
    it('should accept email input', async () => {
      const user = userEvent.setup()
      renderForgotPassword()

      const emailInput = screen.getByLabelText('Email') as HTMLInputElement
      await user.type(emailInput, 'user@example.com')

      expect(emailInput.value).toBe('user@example.com')
    })

    it('should have email input type', () => {
      renderForgotPassword()

      const emailInput = screen.getByLabelText('Email')
      expect(emailInput).toHaveAttribute('type', 'email')
    })
  })

  describe('Form Submission', () => {
    it('should call forgot password mutation with email on submission', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation.mockResolvedValue({
        data: {
          forgotPassword: true,
        },
      })

      renderForgotPassword()

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(mockForgotPasswordMutation).toHaveBeenCalledWith({
          variables: {
            input: {
              email: 'user@example.com',
            },
          },
        })
      })
    })

    it('should display success message on successful submission', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation.mockResolvedValue({
        data: {
          forgotPassword: true,
        },
      })

      renderForgotPassword()

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(screen.getByText(/password reset email sent/i)).toBeInTheDocument()
      })

      expect(
        screen.getByText(/please check your email and follow the instructions/i),
      ).toBeInTheDocument()
    })

    it('should display error when forgot password returns false', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation.mockResolvedValue({
        data: {
          forgotPassword: false,
        },
      })

      renderForgotPassword()

      await user.type(screen.getByLabelText('Email'), 'nonexistent@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(screen.getByText(/there was an error finding your account/i)).toBeInTheDocument()
      })
    })

    it('should display error on mutation failure', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation.mockRejectedValue(new Error('Network error'))

      renderForgotPassword()

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('should display generic error when error has no message', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation.mockRejectedValue({})

      renderForgotPassword()

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      })
    })

    it('should clear previous message on new submission', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation
        .mockResolvedValueOnce({
          data: { forgotPassword: false },
        })
        .mockResolvedValueOnce({
          data: { forgotPassword: true },
        })

      renderForgotPassword()

      // First submission - error
      await user.type(screen.getByLabelText('Email'), 'wrong@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(screen.getByText(/there was an error finding your account/i)).toBeInTheDocument()
      })

      // Second submission - success
      await user.clear(screen.getByLabelText('Email'))
      await user.type(screen.getByLabelText('Email'), 'correct@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(
          screen.queryByText(/there was an error finding your account/i),
        ).not.toBeInTheDocument()
        expect(screen.getByText(/password reset email sent/i)).toBeInTheDocument()
      })
    })
  })

  describe('Loading State', () => {
    it('should show loading text on button during submission', () => {
      vi.mocked(useMutation).mockReturnValue([mockForgotPasswordMutation, { loading: true }] as any)

      renderForgotPassword()

      const submitButton = screen.getByRole('button', { name: /requesting/i })
      expect(submitButton).toBeInTheDocument()
      expect(submitButton.textContent).toBe('Requesting...')
      expect(submitButton).toBeDisabled()
    })

    it('should show normal button text when not loading', () => {
      vi.mocked(useMutation).mockReturnValue([
        mockForgotPasswordMutation,
        { loading: false },
      ] as any)

      renderForgotPassword()

      const submitButton = screen.getByRole('button', { name: /request password reset token/i })
      expect(submitButton).toBeInTheDocument()
      expect(submitButton).not.toBeDisabled()
    })
  })

  describe('Common Scenarios', () => {
    it('should handle email not found scenario gracefully', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation.mockResolvedValue({
        data: { forgotPassword: false },
      })

      renderForgotPassword()

      await user.type(screen.getByLabelText('Email'), 'notfound@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(screen.getByText(/please check that your email is correct/i)).toBeInTheDocument()
      })
    })

    it('should allow multiple submission attempts', async () => {
      const user = userEvent.setup()
      mockForgotPasswordMutation.mockResolvedValue({
        data: { forgotPassword: true },
      })

      renderForgotPassword()

      // First submission
      await user.type(screen.getByLabelText('Email'), 'user1@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(mockForgotPasswordMutation).toHaveBeenCalledTimes(1)
      })

      // Second submission
      await user.clear(screen.getByLabelText('Email'))
      await user.type(screen.getByLabelText('Email'), 'user2@example.com')
      await user.click(screen.getByRole('button', { name: /request password reset/i }))

      await waitFor(() => {
        expect(mockForgotPasswordMutation).toHaveBeenCalledTimes(2)
      })
    })
  })
})
