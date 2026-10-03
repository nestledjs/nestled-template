import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PrismaClient } from '@nestled-template/api/prisma'
import { McpAuthContext } from '../mcp-auth'

export function registerProfileTools(
  server: McpServer,
  prisma: PrismaClient,
  auth: McpAuthContext,
) {
  server.registerTool(
    'get_profile',
    {
      description: 'Get the current authenticated user profile',
      inputSchema: {},
    },
    async () => {
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
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
            ...(auth.organizationId ? { where: { organizationId: auth.organizationId } } : {}),
            select: {
              organizationId: true,
              organization: { select: { id: true, name: true } },
              role: { select: { name: true } },
            },
          },
        },
      })
      if (!user) {
        return { content: [{ type: 'text' as const, text: 'User not found' }], isError: true }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(user, null, 2) }] }
    },
  )
}
