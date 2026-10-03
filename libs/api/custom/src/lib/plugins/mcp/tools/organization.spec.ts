import { registerOrganizationTools } from './organization'

function createServerMock() {
  const handlers = new Map<string, (input: any) => Promise<any>>()
  return {
    server: {
      registerTool: jest.fn(
        (name: string, _config: unknown, handler: (input: any) => Promise<any>) => {
          handlers.set(name, handler)
        },
      ),
    },
    handlers,
  }
}

describe('registerOrganizationTools', () => {
  it('returns an error when scoped tokens have no organization', async () => {
    const { server, handlers } = createServerMock()

    registerOrganizationTools(server as any, {} as any, {
      userId: 'user-1',
      organizationId: null,
      isSuperAdmin: false,
    })

    await expect(handlers.get('get_organization')?.({})).resolves.toEqual({
      content: [{ type: 'text', text: 'No organization associated with this token' }],
      isError: true,
    })
    expect(server.registerTool).toHaveBeenCalledTimes(2)
  })

  it("lists only the user's own organization memberships for unscoped non-admin tokens", async () => {
    const memberships = [
      {
        organization: { id: 'org-1', name: 'Acme' },
        role: { name: 'Member' },
      },
    ]
    const prisma = {
      organizationMember: {
        findMany: jest.fn().mockResolvedValue(memberships),
        count: jest.fn().mockResolvedValue(1),
      },
    }
    const { server, handlers } = createServerMock()

    registerOrganizationTools(server as any, prisma as any, {
      userId: 'user-1',
      organizationId: null,
      isSuperAdmin: false,
    })

    expect(handlers.has('list_organizations')).toBe(true)
    const result = await handlers.get('list_organizations')?.({
      search: 'ac',
      limit: 10,
      offset: 0,
    })

    expect(prisma.organizationMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', organization: { name: { contains: 'ac', mode: 'insensitive' } } },
      take: 10,
      skip: 0,
      include: {
        organization: { select: { id: true, name: true } },
        role: { select: { name: true } },
      },
      orderBy: { organization: { name: 'asc' } },
    })
    expect(prisma.organizationMember.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', organization: { name: { contains: 'ac', mode: 'insensitive' } } },
    })
    expect(JSON.parse(result.content[0].text)).toEqual({ organizations: memberships, total: 1 })
  })

  it('loads the current organization with members and primary email relation', async () => {
    const organization = {
      id: 'org-1',
      name: 'Acme',
      members: [
        {
          user: { id: 'user-1', emails: [{ email: 'primary@example.com' }] },
          role: { id: 'role-1', name: 'Owner' },
        },
      ],
    }
    const prisma = {
      organization: {
        findFirst: jest.fn().mockResolvedValue(organization),
      },
    }
    const { server, handlers } = createServerMock()

    registerOrganizationTools(server as any, prisma as any, {
      userId: 'user-1',
      organizationId: 'org-1',
      isSuperAdmin: false,
    })

    const result = await handlers.get('get_organization')?.({})

    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { id: 'org-1', members: { some: { userId: 'user-1' } } },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                displayName: true,
                emails: {
                  where: { primary: true },
                  select: { email: true },
                  take: 1,
                },
              },
            },
            role: { select: { id: true, name: true } },
          },
        },
      },
    })
    expect(JSON.parse(result.content[0].text)).toEqual(organization)
  })

  it('returns an error when the current organization is missing', async () => {
    const prisma = {
      organization: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    const { server, handlers } = createServerMock()

    registerOrganizationTools(server as any, prisma as any, {
      userId: 'user-1',
      organizationId: 'org-missing',
      isSuperAdmin: false,
    })

    await expect(handlers.get('get_organization')?.({})).resolves.toEqual({
      content: [{ type: 'text', text: 'Organization not found' }],
      isError: true,
    })
  })

  it('allows a super administrator to use an explicitly scoped organization token', async () => {
    const prisma = {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme', members: [] }),
      },
    }
    const { server, handlers } = createServerMock()

    registerOrganizationTools(server as any, prisma as any, {
      userId: 'root-1',
      organizationId: 'org-1',
      isSuperAdmin: true,
    })

    await handlers.get('get_organization')?.({})

    expect(prisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-1' } }),
    )
  })

  it('registers admin organization listing only for unscoped admins', async () => {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    }
    const { server, handlers } = createServerMock()

    registerOrganizationTools(server as any, prisma as any, {
      userId: 'admin-1',
      organizationId: null,
      isSuperAdmin: true,
    })

    expect(handlers.has('list_organizations')).toBe(true)
    const result = await handlers.get('list_organizations')?.({
      search: 'ac',
      limit: 10,
      offset: 5,
    })

    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: { name: { contains: 'ac', mode: 'insensitive' } },
      take: 10,
      skip: 5,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true } },
      },
    })
    expect(prisma.organization.count).toHaveBeenCalledWith({
      where: { name: { contains: 'ac', mode: 'insensitive' } },
    })
    expect(JSON.parse(result.content[0].text)).toEqual({
      organizations: [{ id: 'org-1', name: 'Acme' }],
      total: 1,
    })
    expect(server.registerTool).toHaveBeenCalledTimes(2)
  })
})
