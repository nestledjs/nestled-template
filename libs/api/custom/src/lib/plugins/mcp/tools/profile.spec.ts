import { registerProfileTools } from './profile'

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

describe('registerProfileTools', () => {
  it('loads the authenticated profile with primary email and organization memberships', async () => {
    const user = {
      id: 'user-1',
      firstName: 'Ada',
      emails: [{ email: 'ada@example.com' }],
      organizations: [{ organizationId: 'org-1', role: { name: 'Owner' } }],
    }
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
    }
    const { server, handlers } = createServerMock()

    registerProfileTools(server as any, prisma as any, {
      userId: 'user-1',
      organizationId: 'org-1',
      isSuperAdmin: false,
    })

    const result = await handlers.get('get_profile')?.({})

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
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
        createdAt: true,
        organizations: {
          where: { organizationId: 'org-1' },
          select: {
            organizationId: true,
            organization: { select: { id: true, name: true } },
            role: { select: { name: true } },
          },
        },
      },
    })
    expect(JSON.parse(result.content[0].text)).toEqual(user)
  })

  it('returns an error when the authenticated user no longer exists', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    }
    const { server, handlers } = createServerMock()

    registerProfileTools(server as any, prisma as any, {
      userId: 'missing-user',
      organizationId: null,
      isSuperAdmin: false,
    })

    await expect(handlers.get('get_profile')?.({})).resolves.toEqual({
      content: [{ type: 'text', text: 'User not found' }],
      isError: true,
    })
  })
})
