import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { PrismaClient } from '@nestled-template/api/prisma'
import { McpAuthContext } from '../mcp-auth'

export function registerOrganizationTools(
  server: McpServer,
  prisma: PrismaClient,
  auth: McpAuthContext,
) {
  server.registerTool(
    'get_organization',
    {
      description: 'Get the current organization profile including its members and their roles',
      inputSchema: {},
    },
    async () => {
      if (!auth.organizationId) {
        return {
          content: [{ type: 'text' as const, text: 'No organization associated with this token' }],
          isError: true,
        }
      }
      const org = await prisma.organization.findUnique({
        where: { id: auth.organizationId },
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
      if (!org) {
        return {
          content: [{ type: 'text' as const, text: 'Organization not found' }],
          isError: true,
        }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(org, null, 2) }] }
    },
  )

  if (auth.isAdmin && !auth.organizationId) {
    server.registerTool(
      'list_organizations',
      {
        description: 'List all organizations (admin only)',
        inputSchema: {
          search: z.string().optional().describe('Filter by name'),
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0),
        },
      },
      async ({ search, limit, offset }) => {
        const where: any = {}
        if (search) where.name = { contains: search, mode: 'insensitive' }

        const [orgs, total] = await Promise.all([
          prisma.organization.findMany({
            where,
            take: limit,
            skip: offset,
            orderBy: { name: 'asc' },
            include: {
              _count: { select: { members: true } },
            },
          }),
          prisma.organization.count({ where }),
        ])
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ orgs, total }, null, 2) }],
        }
      },
    )
  }
}
