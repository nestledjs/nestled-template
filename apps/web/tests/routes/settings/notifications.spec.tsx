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

  it('creates a preference that is not saved yet', async () => {
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

    expect(screen.getByText('Notification preferences saved!')).toBeInTheDocument()
  })

  it('updates an existing preference', async () => {
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
  })

  it('shows mutation errors', async () => {
    createPreference.mockRejectedValue(new Error('Save failed'))
    renderRoute()

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Product Updates' }))

    expect(await screen.findByText('Save failed')).toBeInTheDocument()
  })
})
