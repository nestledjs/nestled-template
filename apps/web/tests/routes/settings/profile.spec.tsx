import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ProfileSettings from '../../../app/routes/settings/profile'

const mockUseLoaderData = vi.fn()
const mockUseReadQuery = vi.fn()
const mockUseMutation = vi.fn()
const mockUseApolloClient = vi.fn()

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useLoaderData: () => mockUseLoaderData(),
  }
})

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockUseApolloClient(),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useReadQuery: (...args: unknown[]) => mockUseReadQuery(...args),
}))

vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    Me: { kind: 'Document', definitions: [], __name: 'Me' },
    UpdateUser: { kind: 'Document', definitions: [], __name: 'UpdateUser' },
    ChangeEmail: { kind: 'Document', definitions: [], __name: 'ChangeEmail' },
    ResendVerificationEmail: {
      kind: 'Document',
      definitions: [],
      __name: 'ResendVerificationEmail',
    },
    UploadUserAvatar: { kind: 'Document', definitions: [], __name: 'UploadUserAvatar' },
    RemoveUserAvatar: { kind: 'Document', definitions: [], __name: 'RemoveUserAvatar' },
  }
})

vi.mock('@nestledjs/forms-core', () => ({
  FormFieldClass: {
    content: (key: string, options: unknown) => ({ key, ...options }),
    email: (key: string, options: unknown) => ({ key, ...options }),
    text: (key: string, options: unknown) => ({ key, ...options }),
  },
}))

vi.mock('@nestledjs/forms', () => ({
  Form: () => <div data-testid="profile-form" />,
}))

vi.mock('@nestled-template/shared/styles', () => ({
  formTheme: {},
}))

vi.mock('@nestled-template/web-ui', () => ({
  AvatarUpload: ({ currentImageUrl, onUpload, onRemove }: any) => (
    <div>
      {currentImageUrl ? <img alt="Current avatar" src={currentImageUrl} /> : null}
      <button type="button" onClick={() => onUpload(new File(['avatar'], 'avatar.png'))}>
        Upload Avatar
      </button>
      {onRemove ? (
        <button type="button" onClick={() => onRemove()}>
          Remove Avatar
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock('../../../app/routes/settings/_shared-sections', () => ({
  DangerZoneSection: () => null,
  ExportDataSection: () => null,
  TransferOwnershipSection: () => null,
}))

describe('ProfileSettings avatar handling', () => {
  const uploadUserAvatar = vi.fn()
  const removeUserAvatar = vi.fn()
  const updateUser = vi.fn()
  const changeEmail = vi.fn()
  const resendVerificationEmail = vi.fn()
  const refetchQueries = vi.fn()
  const updateQuery = vi.fn()

  const baseUser = {
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    displayName: 'jane',
    emailValidated: true,
    isSuperAdmin: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    emails: [{ id: 'email-1', email: 'jane@example.com', primary: true, verified: true }],
    avatar: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseLoaderData.mockReturnValue({ meQueryRef: {} })
    mockUseReadQuery.mockReturnValue({ data: { me: baseUser } })
    mockUseApolloClient.mockReturnValue({
      cache: { updateQuery },
      refetchQueries,
    })

    mockUseMutation.mockImplementation((document: { __name?: string }) => {
      const mutations: Record<string, unknown> = {
        UpdateUser: updateUser,
        ChangeEmail: changeEmail,
        ResendVerificationEmail: resendVerificationEmail,
        UploadUserAvatar: uploadUserAvatar,
        RemoveUserAvatar: removeUserAvatar,
      }

      return [mutations[document.__name ?? ''] ?? vi.fn()]
    })

    refetchQueries.mockResolvedValue(undefined)
  })

  it('writes uploaded avatars into the Me cache so global UI updates immediately', async () => {
    const uploadedAvatar = {
      id: 'avatar-2',
      url: 'http://localhost:3000/uploads/user_avatars/user-1/avatar.png',
      publicUrl: 'http://localhost:3000/uploads/user_avatars/user-1/avatar.png',
      filename: 'avatar.png',
      mimeType: 'image/png',
      createdAt: '2026-05-17T00:00:00.000Z',
    }
    let cachedMe = { me: baseUser }

    uploadUserAvatar.mockResolvedValue({ data: { uploadUserAvatar: uploadedAvatar } })
    updateQuery.mockImplementation((_options, updater) => {
      cachedMe = updater(cachedMe)
      return cachedMe
    })

    render(<ProfileSettings />)

    await userEvent.click(screen.getByRole('button', { name: 'Upload Avatar' }))

    await waitFor(() =>
      expect(uploadUserAvatar).toHaveBeenCalledWith({ variables: { file: expect.any(File) } }),
    )
    expect(cachedMe.me.avatar).toEqual({
      __typename: 'StoredFile',
      ...uploadedAvatar,
    })
    expect(refetchQueries).toHaveBeenCalledWith({
      include: [expect.objectContaining({ __name: 'Me' })],
    })
  })

  it('removes avatars through the dedicated mutation and clears the Me cache', async () => {
    const existingAvatar = {
      id: 'avatar-1',
      url: 'http://localhost:3000/uploads/user_avatars/user-1/old.png',
      publicUrl: 'http://localhost:3000/uploads/user_avatars/user-1/old.png',
    }
    let cachedMe = { me: { ...baseUser, avatar: existingAvatar } }

    mockUseReadQuery.mockReturnValue({ data: { me: cachedMe.me } })
    removeUserAvatar.mockResolvedValue({ data: { removeUserAvatar: true } })
    updateQuery.mockImplementation((_options, updater) => {
      cachedMe = updater(cachedMe)
      return cachedMe
    })

    render(<ProfileSettings />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Avatar' }))

    await waitFor(() => expect(removeUserAvatar).toHaveBeenCalled())
    expect(cachedMe.me.avatar).toBeNull()
    expect(refetchQueries).toHaveBeenCalledWith({
      include: [expect.objectContaining({ __name: 'Me' })],
    })
  })
})
