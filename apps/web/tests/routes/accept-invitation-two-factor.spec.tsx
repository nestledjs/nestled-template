import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation } from '@apollo/client/react'
import { useGlobalCtx } from '@nestled-template/web'
import { __resetActiveOrganizationSessionChange } from '@nestled-template/shared/apollo'
import { AcceptOrganizationInvitation, Complete2FaLogin, Login } from '@nestled-template/shared/sdk'
import { createTestRouter } from '../helpers/createTestRouter'
import { stubLocation } from '../helpers/location'
import LoginPage from '../../app/routes/_public/login'
import AcceptInvitationPage from '../../app/routes/accept-invitation'

// From the invitation page to the login page's second factor and back, with both real pages.

vi.mock('@apollo/client/react', () => {
  // One object, as the cache gives: a new one on every render re-runs the page's effect.
  const answer = {
    data: {
      getInvitationDetails: {
        id: 'inv-1',
        email: 'invitee@example.com',
        organizationName: 'Invited Org',
        inviterName: 'Inviter',
        roleName: 'Member',
      },
    },
    loading: false,
  }
  return { useMutation: vi.fn(), useQuery: () => answer }
})

vi.mock('@nestled-template/web', () => ({
  AuthLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  useGlobalCtx: vi.fn(),
}))

vi.mock('@nestledjs/forms', () => ({
  Form: ({
    fields,
    submit,
  }: {
    fields: Array<{ key: string; type: string; options?: { text?: string } }>
    submit: (values: Record<string, unknown>) => void
  }) => (
    <form
      onSubmit={event => {
        event.preventDefault()
        submit({ email: 'invitee@example.com', password: 'correct-password' })
      }}
    >
      {fields
        .filter(({ type }) => type === 'button')
        .map(({ key, options }) => (
          <button key={key} type="submit">
            {options?.text}
          </button>
        ))}
    </form>
  ),
}))

vi.mock('@nestled-template/shared/styles', () => ({ formTheme: {} }))

vi.mock('@nestledjs/forms-core', () => ({
  FormFieldClass: Object.fromEntries(
    ['text', 'email', 'password', 'checkbox', 'button'].map(type => [
      type,
      (key: string, options: unknown) => ({ key, type, options }),
    ]),
  ),
}))

const TOKEN = 'a+token/with=signs&more'
const INVITATION = `/accept-invitation?token=${encodeURIComponent(TOKEN)}`
const PENDING = { token: null, user: null, requires2FA: true, tempToken: 'temp' }

describe('an invitation accepted with a two-factor account', () => {
  let location: ReturnType<typeof stubLocation>
  const accept = vi.fn()
  let answers: Map<unknown, unknown>

  beforeEach(() => {
    localStorage.clear()
    location = stubLocation()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.mocked(useGlobalCtx).mockReturnValue({ user: null } as never)
    accept.mockReset()
    answers = new Map<unknown, unknown>([
      [Login, { login: PENDING }],
      [Complete2FaLogin, { complete2FALogin: { user: { id: 'user-1' } } }],
    ])
    vi.mocked(useMutation).mockImplementation(((document: unknown) => [
      document === AcceptOrganizationInvitation
        ? accept
        : async () => ({ data: answers.get(document) }),
      { loading: false },
    ]) as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetActiveOrganizationSessionChange()
    localStorage.clear()
  })

  function Address() {
    const { pathname, search } = useLocation()
    return <p>{pathname + search}</p>
  }

  const withAddress = (Page: React.ComponentType) => () => (
    <>
      <Address />
      <Page />
    </>
  )

  function renderAt(path: string) {
    const Stub = createTestRouter([
      { path: '/accept-invitation', Component: withAddress(AcceptInvitationPage) },
      { path: '/login', Component: withAddress(LoginPage), loader: () => ({}) },
    ])
    render(<Stub initialEntries={[path]} />)
  }

  async function logInOnInvitation() {
    renderAt(INVITATION)
    await userEvent.click(await screen.findByRole('button', { name: 'Login' }))
    await userEvent.click(screen.getByRole('button', { name: 'Login & Accept Invitation' }))
  }

  it('goes to the login page with a message, and comes back to the same invitation', async () => {
    await logInOnInvitation()

    await screen.findByRole('heading', { name: 'Welcome Back' })
    expect(screen.getByText(/uses two-factor authentication/i)).toBeInTheDocument()
    expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument()
    expect(accept).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Log In' }))
    await userEvent.type(await screen.findByLabelText('Authentication Code'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and Login' }))

    await waitFor(() => expect(location.assign).toHaveBeenCalledTimes(1))
    const target = new URL(location.assign.mock.calls[0][0], 'https://example.test')
    expect(target.pathname).toBe('/accept-invitation')
    expect(target.searchParams.get('token')).toBe(TOKEN)
  })

  it('does not put the temporary token or the password in the address', async () => {
    await logInOnInvitation()
    await screen.findByRole('heading', { name: 'Welcome Back' })
    expect(screen.getByText(/^\/login\?/).textContent).toBe(
      `/login?return_url=${encodeURIComponent(INVITATION)}`,
    )
  })

  it('stays on the page when another user is signed in, whom /login would send on', async () => {
    vi.mocked(useGlobalCtx).mockReturnValue({ user: { id: 'other' } } as never)
    accept.mockRejectedValue(new Error('This invitation is for another address'))
    renderAt(INVITATION)
    await screen.findByText('This invitation is for another address')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))
    await userEvent.click(screen.getByRole('button', { name: 'Login & Accept Invitation' }))

    expect(await screen.findByText(/uses two-factor authentication.*sign out/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome Back' })).not.toBeInTheDocument()
  })

  it('still says the credentials are wrong when they are', async () => {
    answers.set(Login, { login: { user: null } })
    await logInOnInvitation()
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
  })

  it('shows no such message on a plain visit to the login page', async () => {
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Welcome Back' })
    expect(screen.queryByText(/uses two-factor authentication/i)).not.toBeInTheDocument()
  })
})
