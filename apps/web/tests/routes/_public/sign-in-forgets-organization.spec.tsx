import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation } from '@apollo/client/react'
import {
  __resetActiveOrganizationSessionChange,
  ACTIVE_ORGANIZATION_STORAGE_KEY,
  getStoredActiveOrganizationId,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import {
  AcceptOrganizationInvitation,
  Complete2FaLogin,
  Login,
  Register,
  RegisterWithInvitation,
} from '@nestled-template/shared/sdk'
import { createTestRouter } from '../../helpers/createTestRouter'
import { stubLocation } from '../../helpers/location'
import LoginPage from '../../../app/routes/_public/login'
import RegisterPage from '../../../app/routes/_public/register'
import AcceptInvitationPage from '../../../app/routes/accept-invitation'

// A new session must not be sent for the organization the browser stored for whoever was signed in
// before (`x-organization-id`): a shared browser, or a session that ended without a logout (it
// expired, or went through /force-logout, which cannot reach localStorage). Every sign-in path
// forgets the stored organization, and so does the login form opened from a rejected session
// (`expired=1`); any other visit to the form keeps it.
//
// A sign-in also ends with a document load, never a client navigation: the Apollo cache of this
// document may hold the previous user's data.

vi.mock('@apollo/client/react', () => ({
  useMutation: vi.fn(),
  // The invitation page reads its invitation; nothing else here queries.
  useQuery: () => ({
    data: {
      getInvitationDetails: {
        id: 'inv-1',
        token: 'invitation-token',
        email: 'invitee@example.com',
        organizationName: 'Invited Org',
        organizationId: 'invited-org',
        inviterName: 'Inviter',
        roleName: 'Member',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'PENDING',
      },
    },
    loading: false,
  }),
}))

vi.mock('@nestled-template/web', () => ({
  AuthLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  turnstileSiteKey: () => undefined,
  useGlobalCtx: () => ({ user: null }),
  TurnstileWidget: () => null,
}))

// A plain form that submits its inputs' values.
vi.mock('@nestledjs/forms', () => ({
  Form: ({
    id,
    fields,
    submit,
  }: {
    id: string
    fields: Array<{ key: string; type: string; options?: { label?: string; text?: string } }>
    submit: (values: Record<string, unknown>) => void
  }) => (
    <form
      id={id}
      onSubmit={event => {
        event.preventDefault()
        submit(Object.fromEntries(new FormData(event.currentTarget)))
      }}
    >
      {fields.map(({ key, type, options }) =>
        type === 'button' ? (
          <button key={key} type="submit">
            {options?.text}
          </button>
        ) : (
          <label key={key}>
            {options?.label}
            <input name={key} />
          </label>
        ),
      )}
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

const PREVIOUS_USERS_ORGANIZATION = 'org-of-the-previous-user'

type MutationAnswer = (variables: unknown) => unknown

function answerMutations(answers: Map<unknown, MutationAnswer>) {
  vi.mocked(useMutation).mockImplementation(((document: unknown) => [
    vi.fn(async ({ variables }: { variables?: unknown } = {}) => ({
      data: answers.get(document)?.(variables),
    })),
    { loading: false },
  ]) as never)
}

function renderAt(path: string, Component: React.ComponentType) {
  const Stub = createTestRouter([
    { path: path.split('?')[0], Component, loader: () => ({}) },
    // A client navigation after a sign-in would render one of these in the same document.
    { path: '/members/dashboard', Component: () => <p>Dashboard</p> },
    { path: '/members', Component: () => <p>Members</p> },
  ])
  return render(<Stub initialEntries={[path]} />)
}

function stored(): string | null {
  return localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)
}

describe('signing in forgets the organization stored for the previous user', () => {
  let location: ReturnType<typeof stubLocation>

  beforeEach(() => {
    localStorage.clear()
    location = stubLocation()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetActiveOrganizationSessionChange()
    localStorage.clear()
  })

  it('the login form forgets it as it opens after a rejected session (/force-logout lands here with expired=1)', async () => {
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)
    answerMutations(new Map())

    renderAt('/login?expired=1', LoginPage)
    await screen.findByRole('heading', { name: 'Welcome Back' })

    // A passive effect: it may run after the heading is on screen.
    await waitFor(() => expect(getStoredActiveOrganizationId()).toBeNull())
  })

  it('any other visit to the login form keeps the stored organization until a sign-in', async () => {
    // A signed-in user who reaches /login (and is sent on to the app) keeps their organization.
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)
    answerMutations(new Map())

    renderAt('/login', LoginPage)
    await screen.findByRole('heading', { name: 'Welcome Back' })
    // Let the form's effects run before judging that nothing was cleared.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(getStoredActiveOrganizationId()).toBe(PREVIOUS_USERS_ORGANIZATION)
  })

  it('a password sign-in forgets an organization stored after the form opened', async () => {
    answerMutations(new Map([[Login, () => ({ login: { user: { id: 'user-2' } } })]]))
    renderAt('/login', LoginPage)
    await screen.findByRole('heading', { name: 'Welcome Back' })
    // Another tab of the previous user's session stores its organization meanwhile.
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)

    await userEvent.click(screen.getByRole('button', { name: 'Log In' }))

    await waitFor(() => expect(location.assign).toHaveBeenCalledTimes(1))
    expect(location.assign).toHaveBeenCalledWith('/members/dashboard')
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(stored()).toBeNull()
    // The previous user's shell may still be mounted in this document: it stores nothing more.
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)
    expect(stored()).toBeNull()
  })

  it('a sign-in loads the return_url, never a sign-out route', async () => {
    answerMutations(new Map([[Login, () => ({ login: { user: { id: 'user-2' } } })]]))
    const { unmount } = renderAt('/login?return_url=%2Fsettings%2Fprofile%3Ftab%3D2', LoginPage)
    await userEvent.click(await screen.findByRole('button', { name: 'Log In' }))
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith('/settings/profile?tab=2'))
    unmount()

    renderAt('/login?return_url=%2F%2566orce-logout', LoginPage)
    await userEvent.click(await screen.findByRole('button', { name: 'Log In' }))
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith('/members/dashboard'))
  })

  it('a two-factor sign-in forgets it too', async () => {
    answerMutations(
      new Map<unknown, MutationAnswer>([
        [Login, () => ({ login: { requires2FA: true, tempToken: 'temp' } })],
        [Complete2FaLogin, () => ({ complete2FALogin: { user: { id: 'user-2' } } })],
      ]),
    )
    renderAt('/login', LoginPage)
    await userEvent.click(await screen.findByRole('button', { name: 'Log In' }))
    await screen.findByRole('heading', { name: 'Two-Factor Authentication' })
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)

    await userEvent.type(screen.getByLabelText('Authentication Code'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and Login' }))

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith('/members/dashboard'))
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(stored()).toBeNull()
  })

  it('a failed sign-in keeps what is stored', async () => {
    answerMutations(new Map([[Login, () => ({ login: null })]]))
    renderAt('/login', LoginPage)
    await screen.findByRole('heading', { name: 'Welcome Back' })
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)

    await userEvent.click(screen.getByRole('button', { name: 'Log In' }))

    await screen.findByText('Invalid login credentials')
    expect(location.assign).not.toHaveBeenCalled()
    expect(getStoredActiveOrganizationId()).toBe(PREVIOUS_USERS_ORGANIZATION)
  })

  it('registering (which signs the new account in) forgets it', async () => {
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)
    answerMutations(new Map([[Register, () => ({ register: { token: 'token' } })]]))
    renderAt('/register', RegisterPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Create Account' }))

    await waitFor(() => expect(location.assign).toHaveBeenCalledWith('/members/dashboard'))
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(stored()).toBeNull()
  })

  it('signing in on the invitation page forgets it, and loads the invitation in a new document', async () => {
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)
    // An invitation link opened straight after a previous session expired skips the login form.
    let accepted = 0
    answerMutations(
      new Map<unknown, MutationAnswer>([
        [Login, () => ({ login: { user: { id: 'user-2' } } })],
        [
          AcceptOrganizationInvitation,
          () => {
            accepted += 1
            return { acceptOrganizationInvitation: { success: true } }
          },
        ],
      ]),
    )
    renderAt('/accept-invitation?token=invitation-token', AcceptInvitationPage)

    await userEvent.click(await screen.findByRole('button', { name: 'Login' }))
    await userEvent.click(screen.getByRole('button', { name: 'Login & Accept Invitation' }))

    await waitFor(() =>
      expect(location.replace).toHaveBeenCalledWith('/accept-invitation?token=invitation-token'),
    )
    expect(stored()).toBeNull()
    // The new document accepts it, signed in; this one stores and accepts nothing more.
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)
    expect(stored()).toBeNull()
    expect(accepted).toBe(0)
  })

  it('registering on the invitation page forgets it', async () => {
    storeActiveOrganizationId(PREVIOUS_USERS_ORGANIZATION)
    answerMutations(
      new Map<unknown, MutationAnswer>([
        [RegisterWithInvitation, () => ({ registerWithInvitation: { user: { id: 'user-2' } } })],
      ]),
    )
    renderAt('/accept-invitation?token=invitation-token', AcceptInvitationPage)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign Up & Accept Invitation' }),
    )

    await waitFor(() => expect(stored()).toBeNull())
    await waitFor(() => expect(location.replace).toHaveBeenCalledWith('/members'), {
      timeout: 3000,
    })
    expect(screen.queryByText('Members')).not.toBeInTheDocument()
  })
})
