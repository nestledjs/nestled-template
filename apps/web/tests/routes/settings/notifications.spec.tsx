import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestRouter } from '../../helpers/createTestRouter'
import NotificationsSettings from '../../../app/routes/settings/notifications'

const useQuery = vi.fn()
const useMutation = vi.fn()
const createPreference = vi.fn()
const updatePreference = vi.fn()
let mutationIndex = 0

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: (...args: unknown[]) => useMutation(...args),
}))

vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  const doc = { kind: 'Document', definitions: [] }
  return {
    ...actual,
    UserPreferences: doc,
    UserCreateUserPreference: doc,
    UserUpdateUserPreference: doc,
  }
})

describe('NotificationsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutationIndex = 0
    createPreference.mockResolvedValue({ data: {} })
    updatePreference.mockResolvedValue({ data: {} })
    useQuery.mockReturnValue({
      data: {
        userPreferences: [
          {
            id: 'pref-1',
            key: 'notif_weekly_digest',
            value: 'true',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    })
    useMutation.mockImplementation(() => {
      const mutation = mutationIndex === 0 ? createPreference : updatePreference
      mutationIndex += 1
      return [mutation]
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderRoute() {
    const Router = createTestRouter([
      { path: '/settings/notifications', Component: NotificationsSettings },
    ])
    return render(<Router initialEntries={['/settings/notifications']} />)
  }

  it('renders notification categories and preference-backed state', () => {
    renderRoute()

    expect(screen.getByText('Notification Preferences')).toBeInTheDocument()
    expect(
      screen.getByText(/persists these settings to the database, but none of these preferences/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/should usually remain mandatory/i)).toBeInTheDocument()
    expect(screen.getByText('Email Notifications')).toBeInTheDocument()
    expect(screen.getByText('Security Notifications')).toBeInTheDocument()
    expect(screen.getByText('Marketing & Updates')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Toggle Weekly Digest' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('switch', { name: 'Toggle Product Updates' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('creates a new preference and writes it into the Apollo cache', async () => {
    renderRoute()

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Product Updates' }))

    await waitFor(() => {
      expect(createPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: {
              key: 'notif_product_updates',
              value: 'true',
            },
          },
        }),
      )
    })

    const options = createPreference.mock.calls[0][0]
    const cache = {
      modify: vi.fn(({ fields }) => fields.userPreferences(['existing-ref'])),
      writeFragment: vi.fn(() => 'new-ref'),
    }
    options.update(cache, {
      data: {
        userCreateUserPreference: {
          __typename: 'UserPreference',
          id: 'pref-new',
          key: 'notif_product_updates',
          value: 'true',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })
    expect(cache.writeFragment).toHaveBeenCalled()
    expect(screen.getByText('Notification preferences saved!')).toBeInTheDocument()
  })

  it('updates an existing preference and patches the Apollo cache', async () => {
    renderRoute()

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Weekly Digest' }))

    await waitFor(() => {
      expect(updatePreference).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            userPreferenceId: 'pref-1',
            input: { value: 'false' },
          },
        }),
      )
    })

    const options = updatePreference.mock.calls[0][0]
    const cache = {
      identify: vi.fn(() => 'UserPreference:pref-1'),
      modify: vi.fn(({ fields }) =>
        fields.userPreferences([{ __ref: 'UserPreference:pref-1' }, { __ref: 'Other:pref-2' }]),
      ),
    }
    options.update(cache, {
      data: {
        userUpdateUserPreference: {
          __typename: 'UserPreference',
          id: 'pref-1',
          value: 'false',
        },
      },
    })
    expect(cache.modify).toHaveBeenCalled()
  })

  it('shows mutation errors', async () => {
    createPreference.mockRejectedValue(new Error('Save failed'))
    renderRoute()

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Product Updates' }))

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
  })
})
