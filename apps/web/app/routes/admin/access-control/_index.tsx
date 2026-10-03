import { useMemo } from 'react'
import { useApolloClient, useQuery } from '@apollo/client/react'
import {
  PlatformAccessControl,
  type AccessControlRole,
  type AccessControlSnapshot,
  type PlatformAccessControlAdapter,
} from '@nestledjs/access-control'
import {
  AssignPlatformAccessRole,
  CreatePlatformAccessRole,
  DeletePlatformAccessRole,
  MyPlatformPermissions,
  PlatformAccessControl as PlatformAccessControlQuery,
  PlatformAccessControlPrincipals,
  RevokePlatformAccessRole,
  UpdatePlatformAccessRole,
} from '@nestled-template/shared/sdk'
import { useGlobalCtx } from '@nestled-template/web'

function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message)
  return value
}

export default function PlatformAccessControlPage() {
  const client = useApolloClient()
  const { user } = useGlobalCtx()
  const { data: permissionData } = useQuery(MyPlatformPermissions, {
    skip: !user || user.isSuperAdmin,
  })
  const canManage =
    !!user?.isSuperAdmin ||
    (permissionData?.myPlatformPermissions ?? []).some(
      grant =>
        grant === 'platform.access-control.manage' ||
        (grant.endsWith('.*') && 'platform.access-control.manage'.startsWith(grant.slice(0, -1))),
    )
  const adapter = useMemo<PlatformAccessControlAdapter>(
    () => ({
      async load() {
        const { data } = await client.query({
          query: PlatformAccessControlQuery,
          fetchPolicy: 'network-only',
        })
        return required(
          data?.platformAccessControl,
          'The platform access-control snapshot was empty.',
        ) as AccessControlSnapshot
      },
      async searchPrincipals(search) {
        const { data } = await client.query({
          query: PlatformAccessControlPrincipals,
          variables: { search, skip: 0, take: 30 },
          fetchPolicy: 'network-only',
        })
        return required(
          data?.platformAccessControlPrincipals,
          'The platform user search returned no result.',
        )
      },
      async createRole(input) {
        const { data } = await client.mutate({
          mutation: CreatePlatformAccessRole,
          variables: { input },
        })
        return required(
          data?.createPlatformAccessRole,
          'The platform role was not created.',
        ) as AccessControlRole
      },
      async updateRole(input) {
        const { data } = await client.mutate({
          mutation: UpdatePlatformAccessRole,
          variables: { input },
        })
        return required(
          data?.updatePlatformAccessRole,
          'The platform role was not updated.',
        ) as AccessControlRole
      },
      async deleteRole(roleId) {
        const { data } = await client.mutate({
          mutation: DeletePlatformAccessRole,
          variables: { roleId },
        })
        if (!data?.deletePlatformAccessRole) throw new Error('The platform role was not deleted.')
      },
      async assignRole(roleId, userId) {
        const { data } = await client.mutate({
          mutation: AssignPlatformAccessRole,
          variables: { input: { roleId, userId } },
        })
        return required(
          data?.assignPlatformAccessRole,
          'The platform role was not assigned.',
        ) as AccessControlRole
      },
      async revokeRole(roleId, userId) {
        const { data } = await client.mutate({
          mutation: RevokePlatformAccessRole,
          variables: { input: { roleId, userId } },
        })
        return required(
          data?.revokePlatformAccessRole,
          'The platform role was not revoked.',
        ) as AccessControlRole
      },
    }),
    [client],
  )

  return <PlatformAccessControl adapter={adapter} canManage={canManage} theme="system" />
}
