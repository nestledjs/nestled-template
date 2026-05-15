import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { AuthLayout } from '@nestled-template/web'
import { RegisterInput, Register, type RegisterMutation } from '@nestled-template/shared/sdk'
import { formTheme } from '@nestled-template/shared/styles'
import { useMutation } from '@apollo/client/react'

interface RegisterFormInput extends RegisterInput {
  organizationName: string
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [registerMutation, { loading }] = useMutation<RegisterMutation>(Register)

  async function processRegister(input: RegisterFormInput) {
    setFormError(null)
    try {
      // Extract organization name from input
      const { organizationName, ...registerInput } = input

      const { data } = await registerMutation({
        variables: {
          input: {
            ...registerInput,
            organizationName, // Backend now handles this in register mutation
          },
        },
      })

      const token = data?.register?.token
      if (token) {
        // Redirect to dashboard after successful registration
        // Email verification can be handled separately if needed
        navigate('/members/dashboard')
      } else {
        setFormError('Unable to register. Please try again.')
      }
    } catch (error) {
      setFormError((error as Error)?.message || 'Something went wrong')
    }
  }

  const fields = [
    FormFieldClass.text('firstName', { label: 'First Name', required: true }),
    FormFieldClass.text('lastName', { label: 'Last Name', required: true }),
    FormFieldClass.text('organizationName', {
      label: 'Organization Name',
      required: true,
      placeholder: 'Acme Inc.',
      helpText: 'You can invite team members after signing up',
    }),
    FormFieldClass.email('email', { label: 'Email', required: true }),
    FormFieldClass.password('password', {
      label: 'Password',
      required: true,
      helpText: 'Must be at least 8 characters',
    }),
    FormFieldClass.button('submit', {
      fullWidth: true,
      text: loading ? 'Creating Account...' : 'Create Account',
      type: 'submit',
      disabled: loading,
    }),
  ]

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Get started with your organization in minutes"
    >
      <div className="space-y-6">
        <p className="text-center text-sm text-zinc-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-emerald-400 hover:text-emerald-300">
            Log in
          </Link>
        </p>
        {formError && (
          <div className="text-center text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-sm">
            {formError}
          </div>
        )}
        <Form id="register-form" theme={formTheme} fields={fields} submit={processRegister} />
        <p className="text-xs text-center text-zinc-500">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="text-emerald-400 hover:text-emerald-300">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-emerald-400 hover:text-emerald-300">
            Privacy Policy
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
