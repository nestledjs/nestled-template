import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SecuritySettings from '../../../app/routes/settings/security'

const useLoaderData = vi.fn()
const useReadQuery = vi.fn()
const useMutation = vi.fn()
let clipboardWriteText: ReturnType<typeof vi.fn>

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    Link: ({ to, children, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useLoaderData: () => useLoaderData(),
  }
})

vi.mock('@apollo/client/react', () => ({
  useReadQuery: (...args: unknown[]) => useReadQuery(...args),
  useMutation: (...args: unknown[]) => useMutation(...args),
}))

vi.mock('@nestled-template/shared/apollo', () => ({
  apolloLoader: () => (loader: any) => loader,
}))

vi.mock('@nestled-template/shared/sdk', () => ({
  ChangePassword: { kind: 'Document', definitions: [], __name: 'ChangePassword' },
  Disable2Fa: { kind: 'Document', definitions: [], __name: 'Disable2Fa' },
  Enable2Fa: { kind: 'Document', definitions: [], __name: 'Enable2Fa' },
  GetUserSessions: { kind: 'Document', definitions: [], __name: 'GetUserSessions' },
  InvalidateAllSessions: { kind: 'Document', definitions: [], __name: 'InvalidateAllSessions' },
  InvalidateSession: { kind: 'Document', definitions: [], __name: 'InvalidateSession' },
  Me: { kind: 'Document', definitions: [], __name: 'Me' },
  MySecurityEvents: { kind: 'Document', definitions: [], __name: 'MySecurityEvents' },
  Setup2Fa: { kind: 'Document', definitions: [], __name: 'Setup2Fa' },
}))

vi.mock('@nestledjs/forms-core', () => ({
  FormFieldClass: {
    password: (key: string) => ({ key }),
    button: (key: string, options: any) => ({ key, ...options }),
  },
}))

vi.mock('@nestled-template/shared/styles', () => ({
  formTheme: {},
}))

vi.mock('@nestledjs/forms', () => ({
  Form: ({ submit }: any) => (
    <div>
      <button
        type="button"
        onClick={() =>
          submit({
            currentPassword: 'old-password',
            newPassword: 'short',
            confirmPassword: 'different',
          })
        }
      >
        Submit mismatched password
      </button>
      <button
        type="button"
        onClick={() =>
          submit({
            currentPassword: 'old-password',
            newPassword: 'new-password',
            confirmPassword: 'new-password',
          })
        }
      >
        Submit valid password
      </button>
    </div>
  ),
}))

describe('SecuritySettings', () => {
  const changePassword = vi.fn()
  const invalidateSession = vi.fn()
  const invalidateAllSessions = vi.fn()
  const setup2FA = vi.fn()
  const enable2FA = vi.fn()
  const disable2FA = vi.fn()

  const user = {
    id: 'user-1',
    twoFactorEnabled: false,
  }

  const sessions = [
    {
      id: 'current-session',
      deviceInfo: 'Current Browser',
      isCurrent: true,
      lastActiveAt: '2026-05-17T08:00:00.000Z',
      ipAddress: '127.0.0.1',
    },
    {
      id: 'other-session',
      deviceInfo: 'Tablet',
      isCurrent: false,
      lastActiveAt: '2026-05-16T08:00:00.000Z',
      ipAddress: '10.0.0.2',
    },
  ]

  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    useLoaderData.mockReturnValue({
      meQueryRef: 'me-query',
      securityEventsQueryRef: 'events-query',
      userSessionsQueryRef: 'sessions-query',
    })

    changePassword.mockResolvedValue({ data: { changePassword: true } })
    invalidateSession.mockResolvedValue({ data: { invalidateSession: true } })
    invalidateAllSessions.mockResolvedValue({ data: { invalidateAllSessions: 1 } })
    setup2FA.mockResolvedValue({
      data: { setup2FA: { qrCode: 'data:image/png;base64,qr', secret: 'totp-secret' } },
    })
    enable2FA.mockResolvedValue({
      data: { enable2FA: { success: true, backupCodes: ['code-1', 'code-2'] } },
    })
    disable2FA.mockResolvedValue({ data: { disable2FA: true } })

    useMutation.mockImplementation((document: { __name?: string }) => {
      const mutations: Record<string, unknown> = {
        ChangePassword: changePassword,
        InvalidateSession: invalidateSession,
        InvalidateAllSessions: invalidateAllSessions,
        Setup2Fa: setup2FA,
        Enable2Fa: enable2FA,
        Disable2Fa: disable2FA,
      }
      return [mutations[document.__name ?? ''] ?? vi.fn()]
    })

    globalThis.confirm = vi.fn().mockReturnValue(true)
    globalThis.alert = vi.fn()
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
    URL.createObjectURL = vi.fn(() => 'blob:backup-codes')
  })

  function renderPage(twoFactorEnabled = false) {
    const activeUser = { ...user, twoFactorEnabled }
    useReadQuery.mockReset()
    useReadQuery.mockImplementation(queryRef => {
      if (queryRef === 'me-query') return { data: { me: activeUser } }
      if (queryRef === 'sessions-query') return { data: { getUserSessions: sessions } }
      return {
        data: {
          mySecurityEvents: [
            {
              id: 'event-1',
              eventType: 'PASSWORD_CHANGED',
              createdAt: '2026-05-17T08:00:00.000Z',
              ipAddress: '127.0.0.1',
            },
          ],
        },
      }
    })

    return render(<SecuritySettings />)
  }

  it('validates password changes before submitting and sends valid changes', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Submit mismatched password' }))
    expect(changePassword).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Submit valid password' }))

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        variables: {
          input: {
            currentPassword: 'old-password',
            newPassword: 'new-password',
          },
        },
      }),
    )
  })

  it('invalidates individual and other active sessions only after confirmation', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(invalidateSession).toHaveBeenCalledWith({
      variables: { sessionId: 'other-session' },
      refetchQueries: [{ query: expect.any(Object) }],
    })

    vi.mocked(globalThis.confirm).mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Log out of all other sessions' }))
    expect(invalidateAllSessions).not.toHaveBeenCalled()

    vi.mocked(globalThis.confirm).mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'Log out of all other sessions' }))
    expect(invalidateAllSessions).toHaveBeenCalledWith({
      refetchQueries: [{ query: expect.any(Object) }],
    })
    expect(globalThis.alert).toHaveBeenCalledWith('Successfully logged out of 1 session')
  })

  it('sets up 2FA, enables it with a six-digit code, and exposes backup code actions', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Enable 2FA' }))
    expect(setup2FA).toHaveBeenCalled()

    const codeInput = await screen.findByLabelText(/6-digit code/i)
    await user.type(codeInput, 'abc1234567')
    expect(codeInput).toHaveValue('123456')

    await user.click(screen.getByRole('button', { name: 'Verify and Enable' }))
    expect(enable2FA).toHaveBeenCalledWith({
      variables: { input: { code: '123456' } },
      refetchQueries: [{ query: expect.any(Object) }],
    })

    expect(await screen.findByText('code-1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy Codes' }))

    await user.click(screen.getByRole('button', { name: 'Download Codes' }))
    expect(URL.createObjectURL).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: "I've Saved My Codes" }))
    expect(screen.queryByText('code-1')).not.toBeInTheDocument()
  })

  it('disables 2FA after the user provides their password', async () => {
    const user = userEvent.setup()
    renderPage(true)

    await user.click(screen.getByRole('button', { name: 'Disable 2FA' }))
    const passwordInput = screen.getByLabelText(/password to confirm/i)
    await user.type(passwordInput, 'old-password')
    await user.click(screen.getAllByRole('button', { name: 'Disable 2FA' })[1])

    expect(disable2FA).toHaveBeenCalledWith({
      variables: { input: { password: 'old-password' } },
      refetchQueries: [{ query: expect.any(Object) }],
    })
  })
})
