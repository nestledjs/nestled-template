import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Register from '../../../app/routes/_public/register'
import { useMutation } from '@apollo/client/react'

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}))

// Mock the SDK mutation

// Mock form theme
vi.mock('@nestled-template/shared/styles', () => ({
  formTheme: {},
}))

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
          const { label, required, minLength, placeholder, helpText, text, disabled, fullWidth } =
            options || {}

          if (type === 'button') {
            return (
              <button
                key={key}
                type={options?.type || 'button'}
                disabled={disabled}
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

describe('Register Component', () => {
  let mockRegisterMutation: ReturnType<typeof vi.fn>
  let mockNavigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockRegisterMutation = vi.fn()
    mockNavigate = vi.fn()

    vi.mocked(useMutation).mockReturnValue([mockRegisterMutation, { loading: false }] as any)
  })

  const renderRegister = async () => {
    const ReactRouterStub = createTestRouter([
      {
        path: '/register',
        Component: Register,
      },
    ])

    const result = render(<ReactRouterStub initialEntries={['/register']} />)

    // Wait for async rendering to complete
    await waitFor(() => {
      expect(screen.getByTestId('auth-layout')).toBeInTheDocument()
    })

    return result
  }

  describe('Form Rendering', () => {
    it('should render registration form with all required fields', async () => {
      await renderRegister()

      expect(screen.getByLabelText('First Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Organization Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })

    it('should render page title and subtitle', async () => {
      await renderRegister()

      expect(screen.getByText('Create your account')).toBeInTheDocument()
      expect(screen.getByText(/get started with your organization/i)).toBeInTheDocument()
    })

    it('should render login link for existing users', async () => {
      await renderRegister()

      const loginLink = screen.getByText('Log in')
      expect(loginLink).toBeInTheDocument()
      expect(loginLink.closest('a')).toHaveAttribute('href', '/login')
      expect(screen.getByText(/already have an account/i)).toBeInTheDocument()
    })

    it('should render terms and privacy policy links', async () => {
      await renderRegister()

      const termsLink = screen.getByText('Terms of Service')
      const privacyLink = screen.getByText('Privacy Policy')

      expect(termsLink).toBeInTheDocument()
      expect(termsLink.closest('a')).toHaveAttribute('href', '/terms')
      expect(privacyLink).toBeInTheDocument()
      expect(privacyLink.closest('a')).toHaveAttribute('href', '/privacy')
    })

    it('should show password requirements helper text', async () => {
      await renderRegister()

      expect(screen.getByText(/must be at least 8 characters/i)).toBeInTheDocument()
    })

    it('should show organization name helper text', async () => {
      await renderRegister()

      expect(screen.getByText(/you can invite team members after signing up/i)).toBeInTheDocument()
    })

    it('should show organization name placeholder', async () => {
      await renderRegister()

      const orgInput = screen.getByLabelText('Organization Name') as HTMLInputElement
      expect(orgInput.placeholder).toBe('Acme Inc.')
    })
  })

  describe('Form Input Validation', () => {
    it('should accept text input in all fields', async () => {
      const user = userEvent.setup()
      await renderRegister()

      const firstNameInput = screen.getByLabelText('First Name') as HTMLInputElement
      const lastNameInput = screen.getByLabelText('Last Name') as HTMLInputElement
      const orgNameInput = screen.getByLabelText('Organization Name') as HTMLInputElement
      const emailInput = screen.getByLabelText('Email') as HTMLInputElement
      const passwordInput = screen.getByLabelText('Password') as HTMLInputElement

      await user.type(firstNameInput, 'John')
      await user.type(lastNameInput, 'Doe')
      await user.type(orgNameInput, 'Acme Corp')
      await user.type(emailInput, 'john@example.com')
      await user.type(passwordInput, 'password123')

      expect(firstNameInput.value).toBe('John')
      expect(lastNameInput.value).toBe('Doe')
      expect(orgNameInput.value).toBe('Acme Corp')
      expect(emailInput.value).toBe('john@example.com')
      expect(passwordInput.value).toBe('password123')
    })

    it('should mark all fields as required', async () => {
      await renderRegister()

      expect(screen.getByLabelText('First Name')).toHaveAttribute('required')
      expect(screen.getByLabelText('Last Name')).toHaveAttribute('required')
      expect(screen.getByLabelText('Organization Name')).toHaveAttribute('required')
      expect(screen.getByLabelText('Email')).toHaveAttribute('required')
      expect(screen.getByLabelText('Password')).toHaveAttribute('required')
    })
  })

  describe('Form Submission', () => {
    it('should call register mutation with correct data on submission', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockResolvedValue({
        data: {
          register: {
            token: 'auth-token-123',
          },
        },
      })

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Organization Name'), 'Acme Corp')
      await user.type(screen.getByLabelText('Email'), 'john@example.com')
      await user.type(screen.getByLabelText('Password'), 'securePassword123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockRegisterMutation).toHaveBeenCalledWith({
          variables: {
            input: {
              firstName: 'John',
              lastName: 'Doe',
              organizationName: 'Acme Corp',
              email: 'john@example.com',
              password: 'securePassword123',
            },
          },
        })
      })
    })

    it('should display error on registration failure', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockRejectedValue(new Error('Email already exists'))

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Organization Name'), 'Acme Corp')
      await user.type(screen.getByLabelText('Email'), 'existing@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText('Email already exists')).toBeInTheDocument()
      })
    })

    it('should display error when registration returns no token', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockResolvedValue({
        data: {
          register: {
            token: null,
          },
        },
      })

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Organization Name'), 'Acme Corp')
      await user.type(screen.getByLabelText('Email'), 'john@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText('Unable to register. Please try again.')).toBeInTheDocument()
      })
    })

    it('should display generic error when error has no message', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockRejectedValue({})

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Organization Name'), 'Acme Corp')
      await user.type(screen.getByLabelText('Email'), 'john@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      })
    })

    it('should clear error message on new submission', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockRejectedValueOnce(new Error('First error')).mockResolvedValueOnce({
        data: { register: { token: 'token-123' } },
      })

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Organization Name'), 'Acme Corp')
      await user.type(screen.getByLabelText('Email'), 'john@example.com')
      await user.type(screen.getByLabelText('Password'), 'weak')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument()
      })

      // Submit again with different data
      await user.clear(screen.getByLabelText('Password'))
      await user.type(screen.getByLabelText('Password'), 'strongPassword123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument()
      })
    })
  })

  describe('Loading State', () => {
    it('should disable submit button during registration', async () => {
      vi.mocked(useMutation).mockReturnValue([mockRegisterMutation, { loading: true }] as any)

      await renderRegister()

      const submitButton = screen.getByRole('button', { name: /creating account/i })
      expect(submitButton).toBeDisabled()
      expect(submitButton.textContent).toBe('Creating Account...')
    })

    it('should show normal button text when not loading', async () => {
      vi.mocked(useMutation).mockReturnValue([mockRegisterMutation, { loading: false }] as any)

      await renderRegister()

      const submitButton = screen.getByRole('button', { name: /create account/i })
      expect(submitButton).not.toBeDisabled()
      expect(submitButton.textContent).toBe('Create Account')
    })
  })

  describe('Common Registration Scenarios', () => {
    it('should handle weak password error', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockRejectedValue(new Error('Password must be at least 8 characters'))

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Organization Name'), 'Acme Corp')
      await user.type(screen.getByLabelText('Email'), 'john@example.com')
      await user.type(screen.getByLabelText('Password'), '123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
      })
    })

    it('should handle duplicate email error', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockRejectedValue(new Error('User with this email already exists'))

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Organization Name'), 'Acme Corp')
      await user.type(screen.getByLabelText('Email'), 'existing@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText(/user with this email already exists/i)).toBeInTheDocument()
      })
    })

    it('should handle all fields filled correctly and successful registration', async () => {
      const user = userEvent.setup()
      mockRegisterMutation.mockResolvedValue({
        data: {
          register: {
            token: 'valid-auth-token',
          },
        },
      })

      await renderRegister()

      await user.type(screen.getByLabelText('First Name'), 'Jane')
      await user.type(screen.getByLabelText('Last Name'), 'Smith')
      await user.type(screen.getByLabelText('Organization Name'), 'Tech Startup Inc')
      await user.type(screen.getByLabelText('Email'), 'jane@techstartup.com')
      await user.type(screen.getByLabelText('Password'), 'VerySecurePass123!')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockRegisterMutation).toHaveBeenCalledWith({
          variables: {
            input: {
              firstName: 'Jane',
              lastName: 'Smith',
              organizationName: 'Tech Startup Inc',
              email: 'jane@techstartup.com',
              password: 'VerySecurePass123!',
            },
          },
        })
      })

      // Error should not be visible on success
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    })
  })
})
