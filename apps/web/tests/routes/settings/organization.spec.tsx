import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganizationSettings from '../../../app/routes/settings/organization'

const mockUseLoaderData = vi.fn()
const mockUseReadQuery = vi.fn()
const mockUseMutation = vi.fn()
const mockUseApolloClient = vi.fn()
const mockUseRevalidator = vi.fn()
const mockUseGlobalCtx = vi.fn()

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useLoaderData: () => mockUseLoaderData(),
    useRevalidator: () => mockUseRevalidator(),
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
    MyOrganizations: { kind: 'Document', definitions: [], __name: 'MyOrganizations' },
    MyOrganizationsWithMembers: {
      kind: 'Document',
      definitions: [],
      __name: 'MyOrganizationsWithMembers',
    },
    UserUpdateOrganization: { kind: 'Document', definitions: [], __name: 'UserUpdateOrganization' },
    UploadOrganizationLogo: { kind: 'Document', definitions: [], __name: 'UploadOrganizationLogo' },
    RemoveOrganizationLogo: { kind: 'Document', definitions: [], __name: 'RemoveOrganizationLogo' },
  }
})

vi.mock('@nestled-template/web', () => ({
  RequireOwner: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobalCtx: () => mockUseGlobalCtx(),
}))

vi.mock('@nestledjs/forms-core', () => ({
  FormFieldClass: {
    button: (key: string, options: unknown) => ({ key, ...options }),
    text: (key: string, options: unknown) => ({ key, ...options }),
  },
}))

vi.mock('@nestledjs/forms', () => ({
  Form: ({ submit }: { submit: (input: { name: string }) => void }) => (
    <button type="button" onClick={() => submit({ name: 'Pirate & Fox LLCa' })}>
      Save Organization
    </button>
  ),
}))

vi.mock('@nestled-template/shared/styles', () => ({
  formTheme: {},
}))

vi.mock('@nestled-template/web-ui', () => ({
  Avatar: ({ imageUrl, fallbackText }: any) => (
    <div data-testid="readonly-avatar">
      {imageUrl ? <img alt="Readonly organization logo" src={imageUrl} /> : fallbackText}
    </div>
  ),
  AvatarUpload: ({ currentImageUrl, onUpload, onRemove }: any) => (
    <div>
      {currentImageUrl ? <img alt="Current organization logo" src={currentImageUrl} /> : null}
      <button type="button" onClick={() => onUpload(new File(['logo'], 'logo.png'))}>
        Upload Logo
      </button>
      {onRemove ? (
        <button type="button" onClick={() => onRemove()}>
          Remove Logo
        </button>
      ) : null}
    </div>
  ),
}))

describe('OrganizationSettings logo handling', () => {
  const updateOrganization = vi.fn()
  const uploadOrganizationLogo = vi.fn()
  const removeOrganizationLogo = vi.fn()
  const refetchQueries = vi.fn()
  const updateQuery = vi.fn()
  const revalidate = vi.fn()

  const baseOrganization = {
    id: 'org-1',
    name: 'Acme Corp',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    logo: null,
    images: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseLoaderData.mockReturnValue({ myOrganizationsQueryRef: {} })
    mockUseReadQuery.mockReturnValue({
      data: { myOrganizations: [baseOrganization] },
    })
    mockUseApolloClient.mockReturnValue({
      cache: { updateQuery },
      refetchQueries,
    })
    mockUseGlobalCtx.mockReturnValue({
      user: { id: 'user-1', activeOrganizationId: 'org-1' },
      activeOrganizationMember: {
        role: { permissions: [{ subject: 'organization', action: 'delete' }] },
      },
    })
    mockUseRevalidator.mockReturnValue({ revalidate })

    mockUseMutation.mockImplementation((document: { __name?: string }) => {
      const mutations: Record<string, unknown> = {
        UserUpdateOrganization: updateOrganization,
        UploadOrganizationLogo: uploadOrganizationLogo,
        RemoveOrganizationLogo: removeOrganizationLogo,
      }

      return [mutations[document.__name ?? ''] ?? vi.fn()]
    })

    refetchQueries.mockResolvedValue(undefined)
  })

  it('updates the active organization without passing an organization id in mutation variables', async () => {
    updateOrganization.mockResolvedValue({
      data: {
        userUpdateOrganization: {
          ...baseOrganization,
          name: 'Pirate & Fox LLCa',
        },
      },
    })

    render(<OrganizationSettings />)

    await userEvent.click(screen.getByRole('button', { name: 'Save Organization' }))

    await waitFor(() =>
      expect(updateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: { name: 'Pirate & Fox LLCa' },
          },
        }),
      ),
    )
    expect(updateOrganization.mock.calls[0][0].variables).not.toHaveProperty('organizationId')
    expect(updateOrganization.mock.calls[0][0].variables.input).not.toHaveProperty('organizationId')
    expect(revalidate).toHaveBeenCalled()
  })

  it('shows read-only organization details when the member cannot update the organization', () => {
    mockUseGlobalCtx.mockReturnValue({
      user: { id: 'user-1', activeOrganizationId: 'org-1' },
      activeOrganizationMember: {
        role: { permissions: [{ subject: 'organization', action: 'read' }] },
      },
    })

    render(<OrganizationSettings />)

    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Organization details are managed by the organization owner.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Organization' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload Logo' })).not.toBeInTheDocument()
  })

  it('writes uploaded organization logos into organization caches so the sidebar updates immediately', async () => {
    const uploadedLogo = {
      id: 'logo-2',
      url: 'http://localhost:3000/uploads/org_avatars/org-1/logo.png',
      publicUrl: 'http://localhost:3000/uploads/org_avatars/org-1/logo.png',
      filename: 'logo.png',
      mimeType: 'image/png',
      createdAt: '2026-05-17T00:00:00.000Z',
    }
    let cachedOrganizations = { myOrganizations: [baseOrganization] }
    let cachedOrganizationsWithMembers = {
      myOrganizations: [{ ...baseOrganization, members: [], roles: [] }],
    }

    uploadOrganizationLogo.mockResolvedValue({ data: { uploadOrganizationLogo: uploadedLogo } })
    updateQuery.mockImplementation((options, updater) => {
      const queryName = options.query.__name
      if (queryName === 'MyOrganizations') {
        cachedOrganizations = updater(cachedOrganizations)
        return cachedOrganizations
      }

      cachedOrganizationsWithMembers = updater(cachedOrganizationsWithMembers)
      return cachedOrganizationsWithMembers
    })

    render(<OrganizationSettings />)

    await userEvent.click(screen.getByRole('button', { name: 'Upload Logo' }))

    await waitFor(() =>
      expect(uploadOrganizationLogo).toHaveBeenCalledWith({
        variables: {
          file: expect.any(File),
        },
      }),
    )
    expect(cachedOrganizations.myOrganizations[0].logo).toEqual({
      __typename: 'StoredFile',
      ...uploadedLogo,
    })
    expect(cachedOrganizationsWithMembers.myOrganizations[0].logo).toEqual({
      __typename: 'StoredFile',
      ...uploadedLogo,
    })
    expect(refetchQueries).toHaveBeenCalledWith({
      include: [
        expect.objectContaining({ __name: 'MyOrganizations' }),
        expect.objectContaining({ __name: 'MyOrganizationsWithMembers' }),
      ],
    })
  })

  it('updates the organization selected by the authenticated active organization id', async () => {
    const inactiveOrganization = { ...baseOrganization, id: 'org-1', name: 'Inactive Org' }
    const activeOrganization = { ...baseOrganization, id: 'org-2', name: 'Active Org' }
    const uploadedLogo = {
      id: 'logo-2',
      url: 'http://localhost:3000/uploads/org_avatars/org-2/logo.png',
      publicUrl: 'http://localhost:3000/uploads/org_avatars/org-2/logo.png',
      filename: 'logo.png',
      mimeType: 'image/png',
      createdAt: '2026-05-17T00:00:00.000Z',
    }
    let cachedOrganizations = { myOrganizations: [inactiveOrganization, activeOrganization] }
    let cachedOrganizationsWithMembers = {
      myOrganizations: [
        { ...inactiveOrganization, members: [], roles: [] },
        { ...activeOrganization, members: [], roles: [] },
      ],
    }

    mockUseGlobalCtx.mockReturnValue({
      user: { id: 'user-1', activeOrganizationId: 'org-2' },
      activeOrganizationMember: {
        role: { permissions: [{ subject: 'organization', action: 'delete' }] },
      },
    })
    mockUseReadQuery.mockReturnValue({ data: cachedOrganizations })
    uploadOrganizationLogo.mockResolvedValue({ data: { uploadOrganizationLogo: uploadedLogo } })
    updateQuery.mockImplementation((options, updater) => {
      const queryName = options.query.__name
      if (queryName === 'MyOrganizations') {
        cachedOrganizations = updater(cachedOrganizations)
        return cachedOrganizations
      }

      cachedOrganizationsWithMembers = updater(cachedOrganizationsWithMembers)
      return cachedOrganizationsWithMembers
    })

    render(<OrganizationSettings />)

    await userEvent.click(screen.getByRole('button', { name: 'Upload Logo' }))

    await waitFor(() => expect(uploadOrganizationLogo).toHaveBeenCalled())
    expect(cachedOrganizations.myOrganizations[0].logo).toBeNull()
    expect(cachedOrganizations.myOrganizations[1].logo).toEqual({
      __typename: 'StoredFile',
      ...uploadedLogo,
    })
    expect(cachedOrganizationsWithMembers.myOrganizations[0].logo).toBeNull()
    expect(cachedOrganizationsWithMembers.myOrganizations[1].logo).toEqual({
      __typename: 'StoredFile',
      ...uploadedLogo,
    })
  })

  it('removes organization logos through the dedicated mutation and clears organization caches', async () => {
    const existingLogo = {
      id: 'logo-1',
      url: 'http://localhost:3000/uploads/org_avatars/org-1/old.png',
      publicUrl: 'http://localhost:3000/uploads/org_avatars/org-1/old.png',
    }
    let cachedOrganizations = {
      myOrganizations: [{ ...baseOrganization, logo: existingLogo }],
    }
    let cachedOrganizationsWithMembers = {
      myOrganizations: [{ ...baseOrganization, logo: existingLogo, members: [], roles: [] }],
    }

    mockUseReadQuery.mockReturnValue({ data: cachedOrganizations })
    removeOrganizationLogo.mockResolvedValue({ data: { removeOrganizationLogo: true } })
    updateQuery.mockImplementation((options, updater) => {
      const queryName = options.query.__name
      if (queryName === 'MyOrganizations') {
        cachedOrganizations = updater(cachedOrganizations)
        return cachedOrganizations
      }

      cachedOrganizationsWithMembers = updater(cachedOrganizationsWithMembers)
      return cachedOrganizationsWithMembers
    })

    render(<OrganizationSettings />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Logo' }))

    await waitFor(() => expect(removeOrganizationLogo).toHaveBeenCalledWith())
    expect(cachedOrganizations.myOrganizations[0].logo).toBeNull()
    expect(cachedOrganizationsWithMembers.myOrganizations[0].logo).toBeNull()
    expect(refetchQueries).toHaveBeenCalledWith({
      include: [
        expect.objectContaining({ __name: 'MyOrganizations' }),
        expect.objectContaining({ __name: 'MyOrganizationsWithMembers' }),
      ],
    })
  })
})
