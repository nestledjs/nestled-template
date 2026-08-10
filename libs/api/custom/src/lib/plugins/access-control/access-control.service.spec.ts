import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { User } from '@nestled-template/api/core/models'
import { PlatformAccessControlService } from './access-control.service'

const actor = { id: 'actor-1', isSuperAdmin: true } as User

const catalogPermission = {
  id: 'permission-1',
  key: 'platform.users.read',
  namespace: 'platform.users',
  action: 'read',
  description: 'View users',
}

const mutableRole = (assignments: Array<{ id: string; userId: string }> = []) => ({
  id: 'role-1',
  key: 'custom.support',
  name: 'Support',
  description: null,
  isSystem: false,
  permissions: [catalogPermission],
  assignments,
})

const mappedRole = (withEmail = true) => ({
  ...mutableRole(),
  assignments: [
    {
      id: 'assignment-1',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      user: {
        id: 'user-1',
        displayName: 'Ada Lovelace',
        isSuperAdmin: false,
        emails: withEmail ? [{ email: 'ada@example.com' }] : [],
      },
    },
  ],
})

function createDataMock() {
  const transaction = {
    platformRole: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    platformRoleAssignment: {
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  }
  const data = {
    platformRoleAssignment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    platformPermission: { findMany: jest.fn() },
    platformRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async callback => callback(transaction)),
  }
  return { data, transaction }
}

describe('PlatformAccessControlService', () => {
  it('returns a de-duplicated grant set across assigned roles', async () => {
    const { data } = createDataMock()
    data.platformRoleAssignment.findMany.mockResolvedValue([
      { role: { permissions: [{ key: 'platform.users.read' }] } },
      {
        role: {
          permissions: [{ key: 'platform.users.read' }, { key: 'platform.audit.read' }],
        },
      },
    ])
    const service = new PlatformAccessControlService(data as never)

    await expect(service.getUserPlatformPermissions('user-1')).resolves.toEqual([
      'platform.users.read',
      'platform.audit.read',
    ])
  })

  it('allows delegated management only when the actor covers every target capability', async () => {
    const { data } = createDataMock()
    data.user.findUnique
      .mockResolvedValueOnce({ id: 'actor-1', isSuperAdmin: false })
      .mockResolvedValueOnce({ id: 'target-1', isSuperAdmin: false })
    data.platformRoleAssignment.findMany
      .mockResolvedValueOnce([
        {
          role: {
            permissions: [{ key: 'platform.users.manage' }, { key: 'platform.audit.read' }],
          },
        },
      ])
      .mockResolvedValueOnce([{ role: { permissions: [{ key: 'platform.audit.read' }] } }])
    const service = new PlatformAccessControlService(data as never)

    await expect(service.assertCanManagePrincipal('actor-1', 'target-1')).resolves.toBeUndefined()
  })

  it('rejects delegated management when the target has an uncovered capability', async () => {
    const { data } = createDataMock()
    data.user.findUnique
      .mockResolvedValueOnce({ id: 'actor-1', isSuperAdmin: false })
      .mockResolvedValueOnce({ id: 'target-1', isSuperAdmin: false })
    data.platformRoleAssignment.findMany
      .mockResolvedValueOnce([{ role: { permissions: [{ key: 'platform.users.manage' }] } }])
      .mockResolvedValueOnce([{ role: { permissions: [{ key: 'platform.audit.read' }] } }])
    const service = new PlatformAccessControlService(data as never)

    await expect(service.assertCanManagePrincipal('actor-1', 'target-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('rejects delegated management of a peer with equal platform access', async () => {
    const { data } = createDataMock()
    data.user.findUnique
      .mockResolvedValueOnce({ id: 'actor-1', isSuperAdmin: false })
      .mockResolvedValueOnce({ id: 'target-1', isSuperAdmin: false })
    const grants = [{ role: { permissions: [{ key: 'platform.users.manage' }] } }]
    data.platformRoleAssignment.findMany.mockResolvedValueOnce(grants).mockResolvedValueOnce(grants)
    const service = new PlatformAccessControlService(data as never)

    await expect(service.assertCanManagePrincipal('actor-1', 'target-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('never allows emulation of a root administrator', async () => {
    const { data } = createDataMock()
    data.user.findUnique
      .mockResolvedValueOnce({ id: 'root-1', isSuperAdmin: true })
      .mockResolvedValueOnce({ id: 'root-2', isSuperAdmin: true })
    const service = new PlatformAccessControlService(data as never)

    await expect(
      service.assertCanManagePrincipal('root-1', 'root-2', 'emulate'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(data.platformRoleAssignment.findMany).not.toHaveBeenCalled()
  })

  it('rejects permission keys that are not in the code-owned catalog', async () => {
    const { data } = createDataMock()
    data.platformPermission.findMany.mockResolvedValue([])
    const service = new PlatformAccessControlService(data as never)

    await expect(
      service.createRole(actor, {
        name: 'Support',
        permissionKeys: ['platform.made-up.manage'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('reserves the platform wildcard for the immutable root role', async () => {
    const { data } = createDataMock()
    const service = new PlatformAccessControlService(data as never)

    await expect(
      service.createRole(actor, {
        name: 'Another root',
        permissionKeys: ['platform.*'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(data.platformPermission.findMany).not.toHaveBeenCalled()
  })

  it('creates a custom role and its audit event in one transaction', async () => {
    const { data, transaction } = createDataMock()
    const permission = {
      id: 'permission-1',
      key: 'platform.users.read',
      namespace: 'platform.users',
      action: 'read',
      description: 'View users',
    }
    data.platformPermission.findMany.mockResolvedValue([permission])
    transaction.platformRole.create.mockResolvedValue({
      id: 'role-1',
      key: 'custom.role-1',
      name: 'Support',
      description: null,
      isSystem: false,
      permissions: [permission],
      assignments: [],
    })
    const service = new PlatformAccessControlService(data as never)

    await expect(
      service.createRole(actor, {
        name: 'Support',
        permissionKeys: ['platform.users.read'],
      }),
    ).resolves.toMatchObject({ id: 'role-1', name: 'Support' })
    expect(transaction.platformRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Support',
          permissions: { connect: [{ id: 'permission-1' }] },
        }),
      }),
    )
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PLATFORM_ROLE_CREATED', entityId: 'role-1' }),
      }),
    )
  })

  it('does not permit assignment of immutable system roles', async () => {
    const { data } = createDataMock()
    data.platformRole.findUnique.mockResolvedValue({
      id: 'root-role',
      isSystem: true,
      permissions: [],
      assignments: [],
    })
    const service = new PlatformAccessControlService(data as never)

    await expect(service.assignRole(actor, 'root-role', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(data.user.findUnique).not.toHaveBeenCalled()
  })

  it('refuses to assign a platform role to an inactive principal', async () => {
    const { data } = createDataMock()
    data.platformRole.findUnique.mockResolvedValue({
      id: 'role-1',
      name: 'Support',
      isSystem: false,
      permissions: [],
      assignments: [],
    })
    data.user.findUnique.mockResolvedValue({ isActive: false })
    const service = new PlatformAccessControlService(data as never)

    await expect(service.assignRole(actor, 'role-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('applies the principal ceiling before assigning a delegated platform role', async () => {
    const { data, transaction } = createDataMock()
    data.platformRole.findUnique.mockResolvedValue({
      id: 'role-1',
      name: 'Support',
      isSystem: false,
      permissions: [{ key: 'platform.users.read' }],
      assignments: [],
    })
    const delegatedGrants = [
      {
        role: {
          permissions: [{ key: 'platform.users.read' }, { key: 'platform.users.manage' }],
        },
      },
    ]
    data.platformRoleAssignment.findMany
      .mockResolvedValueOnce(delegatedGrants)
      .mockResolvedValueOnce(delegatedGrants)
      .mockResolvedValueOnce(delegatedGrants)
    data.user.findUnique
      .mockResolvedValueOnce({ isActive: true })
      .mockResolvedValueOnce({ id: 'actor-1', isSuperAdmin: false })
      .mockResolvedValueOnce({ id: 'target-1', isSuperAdmin: false })
    const service = new PlatformAccessControlService(data as never)
    const delegatedActor = { id: 'actor-1', isSuperAdmin: false } as User

    await expect(service.assignRole(delegatedActor, 'role-1', 'target-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(transaction.platformRoleAssignment.upsert).not.toHaveBeenCalled()
  })

  it('does not let a delegated administrator edit a role held by an equal principal', async () => {
    const { data } = createDataMock()
    data.platformRole.findUnique.mockResolvedValue({
      id: 'role-1',
      key: 'custom.support',
      name: 'Support',
      description: null,
      isSystem: false,
      permissions: [{ key: 'platform.users.read' }],
      assignments: [{ id: 'assignment-1', userId: 'target-1' }],
    })
    const delegatedGrants = [
      {
        role: {
          permissions: [{ key: 'platform.users.read' }, { key: 'platform.access-control.manage' }],
        },
      },
    ]
    data.platformRoleAssignment.findMany
      .mockResolvedValueOnce(delegatedGrants)
      .mockResolvedValueOnce(delegatedGrants)
      .mockResolvedValueOnce(delegatedGrants)
    data.user.findUnique
      .mockResolvedValueOnce({ id: 'actor-1', isSuperAdmin: false })
      .mockResolvedValueOnce({ id: 'target-1', isSuperAdmin: false })
    const service = new PlatformAccessControlService(data as never)
    const delegatedActor = { id: 'actor-1', isSuperAdmin: false } as User

    await expect(
      service.updateRole(delegatedActor, {
        roleId: 'role-1',
        name: 'Support',
        permissionKeys: ['platform.users.read'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(data.$transaction).not.toHaveBeenCalled()
  })

  it('maps the permission catalog, roles, assignments, and principals into a snapshot', async () => {
    const { data } = createDataMock()
    data.platformPermission.findMany.mockResolvedValue([catalogPermission])
    data.platformRole.findMany.mockResolvedValue([mappedRole(), mappedRole(false)])
    const service = new PlatformAccessControlService(data as never)

    await expect(service.getSnapshot()).resolves.toMatchObject({
      permissions: [catalogPermission],
      roles: [
        { assignments: [{ principal: { email: 'ada@example.com' } }] },
        { assignments: [{ principal: { email: null } }] },
      ],
    })
  })

  it('searches principals with normalized bounds and supports an empty search', async () => {
    const { data } = createDataMock()
    data.user.findMany
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          displayName: 'Ada Lovelace',
          isSuperAdmin: false,
          emails: [{ email: 'ada@example.com' }],
        },
        { id: 'user-2', displayName: null, isSuperAdmin: true, emails: [] },
      ])
      .mockResolvedValueOnce([])
    data.user.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    const service = new PlatformAccessControlService(data as never)

    await expect(service.searchPrincipals('  Ada  ', -4.8, 99.9)).resolves.toEqual({
      principals: [
        {
          id: 'user-1',
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
          isSuperAdmin: false,
        },
        { id: 'user-2', displayName: null, email: null, isSuperAdmin: true },
      ],
      total: 2,
    })
    expect(data.user.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        skip: 0,
        take: 50,
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    )

    await expect(service.searchPrincipals('', 0, 0)).resolves.toEqual({ principals: [], total: 0 })
    expect(data.user.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip: 0, take: 1, where: {} }),
    )
  })

  it('rejects an oversized principal search before querying users', async () => {
    const { data } = createDataMock()
    const service = new PlatformAccessControlService(data as never)

    await expect(service.searchPrincipals('x'.repeat(121))).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(data.user.findMany).not.toHaveBeenCalled()
  })

  it('updates a mutable role and records the before and after values', async () => {
    const { data, transaction } = createDataMock()
    data.platformRole.findUnique.mockResolvedValue(mutableRole())
    data.platformRole.findFirst.mockResolvedValue(null)
    data.platformPermission.findMany.mockResolvedValue([catalogPermission])
    transaction.platformRole.update.mockResolvedValue({
      ...mappedRole(),
      name: 'Senior Support',
      description: 'Handles escalations',
    })
    const service = new PlatformAccessControlService(data as never)

    await expect(
      service.updateRole(actor, {
        roleId: 'role-1',
        name: '  Senior   Support ',
        description: ' Handles escalations ',
        permissionKeys: [' platform.users.read ', 'platform.users.read'],
      }),
    ).resolves.toMatchObject({ name: 'Senior Support', description: 'Handles escalations' })
    expect(transaction.platformRole.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'role-1' },
        data: expect.objectContaining({
          name: 'Senior Support',
          description: 'Handles escalations',
          permissions: { set: [{ id: 'permission-1' }] },
        }),
      }),
    )
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PLATFORM_ROLE_UPDATED' }),
      }),
    )
  })

  it('deletes an unassigned mutable role and audits the deletion', async () => {
    const { data, transaction } = createDataMock()
    data.platformRole.findUnique.mockResolvedValue(mutableRole())
    const service = new PlatformAccessControlService(data as never)

    await expect(service.deleteRole(actor, 'role-1')).resolves.toBe(true)
    expect(transaction.platformRole.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } })
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PLATFORM_ROLE_DELETED' }),
      }),
    )
  })

  it('requires assignments to be removed before deleting a role', async () => {
    const { data, transaction } = createDataMock()
    data.platformRole.findUnique.mockResolvedValue(
      mutableRole([{ id: 'assignment-1', userId: 'user-1' }]),
    )
    const service = new PlatformAccessControlService(data as never)

    await expect(service.deleteRole(actor, 'role-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(transaction.platformRole.delete).not.toHaveBeenCalled()
  })

  it('assigns a role to an active manageable principal and returns the refreshed role', async () => {
    const { data, transaction } = createDataMock()
    data.platformRole.findUnique
      .mockResolvedValueOnce(mutableRole())
      .mockResolvedValueOnce(mappedRole())
    data.user.findUnique
      .mockResolvedValueOnce({ isActive: true })
      .mockResolvedValueOnce({ id: 'actor-1', isSuperAdmin: true })
      .mockResolvedValueOnce({ id: 'user-1', isSuperAdmin: false })
    const service = new PlatformAccessControlService(data as never)

    await expect(service.assignRole(actor, 'role-1', 'user-1')).resolves.toMatchObject({
      id: 'role-1',
      assignments: [{ principal: { id: 'user-1' } }],
    })
    expect(transaction.platformRoleAssignment.upsert).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: 'user-1', roleId: 'role-1' } },
      update: { assignedById: 'actor-1' },
      create: { userId: 'user-1', roleId: 'role-1', assignedById: 'actor-1' },
    })
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PLATFORM_ROLE_ASSIGNED' }),
      }),
    )
  })

  it('revokes an existing role assignment and returns the refreshed role', async () => {
    const { data, transaction } = createDataMock()
    data.platformRole.findUnique
      .mockResolvedValueOnce(mutableRole())
      .mockResolvedValueOnce(mappedRole(false))
    data.user.findUnique
      .mockResolvedValueOnce({ id: 'actor-1', isSuperAdmin: true })
      .mockResolvedValueOnce({ id: 'user-1', isSuperAdmin: false })
    data.platformRoleAssignment.findUnique.mockResolvedValue({ id: 'assignment-1' })
    const service = new PlatformAccessControlService(data as never)

    await expect(service.revokeRole(actor, 'role-1', 'user-1')).resolves.toMatchObject({
      id: 'role-1',
      assignments: [{ principal: { email: null } }],
    })
    expect(transaction.platformRoleAssignment.delete).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
    })
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PLATFORM_ROLE_REVOKED' }),
      }),
    )
  })

  it('rejects invalid role fields before writing a role', async () => {
    const { data } = createDataMock()
    data.platformRole.findFirst.mockResolvedValue(null)
    const service = new PlatformAccessControlService(data as never)

    await expect(
      service.createRole(actor, { name: 'x', permissionKeys: [] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createRole(actor, {
        name: 'Support',
        description: 'x'.repeat(501),
        permissionKeys: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createRole(actor, {
        name: 'Support',
        permissionKeys: [`platform.${'x'.repeat(161)}`],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(data.$transaction).not.toHaveBeenCalled()
  })
})
