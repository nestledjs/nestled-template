import React, { useState } from 'react'
import { useLoaderData, useRevalidator } from 'react-router'
import { BuildingOfficeIcon, TrashIcon } from '@heroicons/react/24/outline'
import { RequireOwner, useGlobalCtx } from '@nestled-template/web'
import { Form } from '@nestledjs/forms'
import { FormFieldClass } from '@nestledjs/forms-core'
import { formTheme } from '@nestled-template/shared/styles'
import { apolloLoader } from '@nestled-template/shared/apollo'
import {
  MyOrganizations,
  MyOrganizationsWithMembers,
  type MyOrganizationsQuery,
  type MyOrganizationsWithMembersQuery,
  UserUpdateOrganization,
  UploadOrganizationLogo,
  type UserUpdateOrganizationMutation,
  type UploadOrganizationLogoMutation,
  RemoveOrganizationLogo,
  type RemoveOrganizationLogoMutation,
} from '@nestled-template/shared/sdk'
import { useApolloClient, useReadQuery, type QueryRef, useMutation } from '@apollo/client/react'
import { Avatar, AvatarUpload } from '@nestled-template/web-ui'

export const loader = apolloLoader()(({ preloadQuery }) => {
  const myOrganizationsQueryRef = preloadQuery<MyOrganizationsQuery>(MyOrganizations, {
    fetchPolicy: 'network-only', // Always fetch fresh data, bypass cache
  })
  return { myOrganizationsQueryRef }
})

type OrgLogo = NonNullable<MyOrganizationsQuery['myOrganizations'][number]['logo']>
type UserWithActiveOrganization = {
  activeOrganizationId?: string | null
}
type Permission = { subject?: string | null; action?: string | null }

type OrganizationQueryName = 'myOrganizations' | 'myOrganizationsWithMembers'

function replaceOrganizationLogo<
  TData extends Partial<
    Record<OrganizationQueryName, Array<{ id: string; logo?: OrgLogo | null }>>
  >,
>(
  existing: TData | null | undefined,
  organizationId: string,
  logo: OrgLogo | null,
): TData | null | undefined {
  if (!existing) {
    return existing
  }

  const queryName = existing.myOrganizations ? 'myOrganizations' : 'myOrganizationsWithMembers'
  const organizations = existing[queryName]
  if (!organizations) {
    return existing
  }

  return {
    ...existing,
    [queryName]: organizations.map(organization =>
      organization.id === organizationId ? { ...organization, logo } : organization,
    ),
  }
}

function writeOrganizationLogoToCache(
  client: ReturnType<typeof useApolloClient>,
  organizationId: string,
  logo: OrgLogo | null,
) {
  client.cache.updateQuery<MyOrganizationsQuery>({ query: MyOrganizations }, existing =>
    replaceOrganizationLogo(existing, organizationId, logo),
  )
  client.cache.updateQuery<MyOrganizationsWithMembersQuery>(
    { query: MyOrganizationsWithMembers },
    existing => replaceOrganizationLogo(existing, organizationId, logo),
  )
}

function uploadedFileToOrganizationLogo(
  uploadedFile: UploadOrganizationLogoMutation['uploadOrganizationLogo'],
): OrgLogo {
  return {
    __typename: 'StoredFile' as const,
    id: uploadedFile.id,
    url: uploadedFile.url,
    publicUrl: uploadedFile.publicUrl,
    filename: uploadedFile.filename,
    mimeType: uploadedFile.mimeType,
    createdAt: uploadedFile.createdAt,
  }
}

function hasPermission(permissions: readonly Permission[] | null | undefined, permission: string) {
  const [subject, action] = permission.split(':')
  return (
    permissions?.some(
      item =>
        (item.subject === 'all' && item.action === 'manage') ||
        (item.subject === subject && item.action === action),
    ) ?? false
  )
}

export default function OrganizationSettings() {
  const loaderData = useLoaderData() as { myOrganizationsQueryRef: QueryRef<MyOrganizationsQuery> }
  const { data } = useReadQuery(loaderData.myOrganizationsQueryRef)
  const { activeOrganizationMember, user } = useGlobalCtx()
  const organizations = data?.myOrganizations || []
  const userWithActiveOrganization = user as UserWithActiveOrganization | null | undefined
  const activeOrganization =
    organizations.find(org => org.id === userWithActiveOrganization?.activeOrganizationId) ||
    organizations[0] ||
    null
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [logoMessage, setLogoMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [updateOrganization] = useMutation<UserUpdateOrganizationMutation>(UserUpdateOrganization)
  const [uploadOrganizationLogo] =
    useMutation<UploadOrganizationLogoMutation>(UploadOrganizationLogo)
  const [removeOrganizationLogo] =
    useMutation<RemoveOrganizationLogoMutation>(RemoveOrganizationLogo)
  const revalidator = useRevalidator()
  const client = useApolloClient()
  const canUpdateOrganization = hasPermission(
    activeOrganizationMember?.role?.permissions,
    'organization:delete',
  )

  async function handleUpdateOrganization(input: { name: string }) {
    setFormError(null)
    setFormSuccess(null)

    if (!activeOrganization) {
      setFormError('No active organization selected')
      return
    }

    try {
      const result = await updateOrganization({
        variables: {
          input: {
            name: input.name,
          },
        },
        refetchQueries: [{ query: MyOrganizations }],
        awaitRefetchQueries: true, // Wait for refetch to complete
      })

      if (result.data?.userUpdateOrganization) {
        setFormSuccess('Organization updated successfully!')
        // Revalidate the loader data to get fresh SSR data
        revalidator.revalidate()
      }
    } catch (error) {
      setFormError((error as Error)?.message ?? 'Failed to update organization')
    }
  }

  const organizationLogo = activeOrganization?.logo

  const handleLogoUpload = async (file: File) => {
    if (!activeOrganization) return

    try {
      const result = await uploadOrganizationLogo({
        variables: {
          file,
        },
      })

      if (result.data?.uploadOrganizationLogo) {
        writeOrganizationLogoToCache(
          client,
          activeOrganization.id,
          uploadedFileToOrganizationLogo(result.data.uploadOrganizationLogo),
        )
        // Refresh both queries so sidebar and org page update
        await client.refetchQueries({ include: [MyOrganizations, MyOrganizationsWithMembers] })
        setLogoMessage({ type: 'success', text: 'Logo uploaded successfully!' })
        setTimeout(() => setLogoMessage(null), 3000)
      }
    } catch (error) {
      console.error('Logo upload failed:', error)
      setLogoMessage({ type: 'error', text: (error as Error).message || 'Failed to upload logo' })
      setTimeout(() => setLogoMessage(null), 5000)
    }
  }

  const handleLogoRemove = async () => {
    if (!activeOrganization || !organizationLogo) {
      setLogoMessage({ type: 'error', text: 'No logo to remove' })
      setTimeout(() => setLogoMessage(null), 3000)
      return
    }

    try {
      await removeOrganizationLogo()
      writeOrganizationLogoToCache(client, activeOrganization.id, null)
      await client.refetchQueries({ include: [MyOrganizations, MyOrganizationsWithMembers] })
      setLogoMessage({ type: 'success', text: 'Logo removed' })
    } catch (error) {
      console.error('Logo removal failed:', error)
      setLogoMessage({ type: 'error', text: (error as Error).message || 'Failed to remove logo' })
    }
    setTimeout(() => setLogoMessage(null), 3000)
  }

  const organizationFields = [
    FormFieldClass.text('name', {
      label: 'Organization Name',
      required: true,
      defaultValue: activeOrganization?.name || '',
      placeholder: 'Acme Inc.',
    }),
    FormFieldClass.button('submit', {
      text: 'Save Changes',
      type: 'submit',
      fullWidth: false,
    }),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 dark:bg-emerald-500/10 p-3">
            <BuildingOfficeIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
              Organization Settings
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Manage your organization details and settings
            </p>
          </div>
        </div>
      </div>

      {/* Organization Branding */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Organization</h3>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {canUpdateOrganization ? (
            <AvatarUpload
              currentImageUrl={organizationLogo?.publicUrl ?? organizationLogo?.url ?? undefined}
              fallbackText={activeOrganization?.name || 'Org'}
              onUpload={handleLogoUpload}
              onRemove={organizationLogo ? handleLogoRemove : undefined}
              size="xl"
            />
          ) : (
            <Avatar
              imageUrl={organizationLogo?.publicUrl ?? organizationLogo?.url ?? undefined}
              fallbackText={activeOrganization?.name || 'Org'}
              size="xl"
            />
          )}
          <div className="min-w-0">
            <h4 className="text-xl font-semibold text-zinc-900 dark:text-white">
              {activeOrganization?.name || 'Organization'}
            </h4>
            {canUpdateOrganization ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Upload a logo to represent your organization
              </p>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Organization details are managed by the organization owner.
              </p>
            )}
            {canUpdateOrganization && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Recommended: Square image, at least 200x200px. Max file size: 5MB.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {logoMessage && (
            <div
              className={`rounded-lg p-3 text-sm ${
                logoMessage.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                  : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
              }`}
            >
              {logoMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* Organization Details */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Organization Details
        </h3>

        {formError && (
          <div className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
            {formError}
          </div>
        )}

        {formSuccess && (
          <div className="mb-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            {formSuccess}
          </div>
        )}

        {canUpdateOrganization ? (
          <Form
            id="organization-form"
            theme={formTheme}
            fields={organizationFields}
            submit={handleUpdateOrganization}
          />
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Organization Name</h4>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {activeOrganization?.name || 'Organization'}
            </p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-white/10">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Organization ID</h4>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                {activeOrganization?.id}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Created</h4>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                {activeOrganization?.createdAt
                  ? new Date(activeOrganization.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Unknown'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <RequireOwner>
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/20 bg-white dark:bg-white/5 p-6 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-rose-100 dark:bg-rose-500/10 p-3">
              <TrashIcon className="h-6 w-6 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-400">
                Danger Zone
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                Deleting your organization will permanently remove all associated data, including
                members, settings, and billing information. This action cannot be undone.
              </p>
              <button
                type="button"
                className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors"
                onClick={() => {
                  alert(
                    'Delete organization functionality will be implemented with proper confirmation flow',
                  )
                }}
              >
                Delete Organization
              </button>
            </div>
          </div>
        </div>
      </RequireOwner>
    </div>
  )
}
