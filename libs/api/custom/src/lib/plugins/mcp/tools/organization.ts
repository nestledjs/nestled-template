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
      const org = await prisma.organization.findFirst({
        where: {
          id: auth.organizationId,
          ...(auth.isSuperAdmin ? {} : { members: { some: { userId: auth.userId } } }),
        },
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

  if (!auth.organizationId) {
    server.registerTool(
      'list_organizations',
      {
        description: auth.isSuperAdmin
          ? 'List all organizations (admin)'
          : 'List organizations you belong to',
        inputSchema: {
          search: z.string().optional().describe('Filter by name'),
          limit: z.coerce.number().min(1).max(100).default(20),
          offset: z.coerce.number().min(0).default(0),
        },
      },
      async ({ search, limit, offset }) => {
        if (auth.isSuperAdmin) {
          const where: any = {}
          if (search) where.name = { contains: search, mode: 'insensitive' }

          const [organizations, total] = await Promise.all([
            prisma.organization.findMany({
              where,
              take: limit,
              skip: offset,
              orderBy: { name: 'asc' },
              include: { _count: { select: { members: true } } },
            }),
            prisma.organization.count({ where }),
          ])
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ organizations, total }, null, 2) },
            ],
          }
        }

        const where: any = { userId: auth.userId }
        if (search) where.organization = { name: { contains: search, mode: 'insensitive' } }

        const [organizations, total] = await Promise.all([
          prisma.organizationMember.findMany({
            where,
            take: limit,
            skip: offset,
            include: {
              organization: { select: { id: true, name: true } },
              role: { select: { name: true } },
            },
            orderBy: { organization: { name: 'asc' } },
          }),
          prisma.organizationMember.count({ where }),
        ])
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ organizations, total }, null, 2) },
          ],
        }
      },
    )
  }
}
