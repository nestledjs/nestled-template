import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { McpAuthContext } from './mcp-auth'
import { registerOrganizationTools } from './tools/organization'
import { registerProfileTools } from './tools/profile'

@Injectable()
export class McpServerFactory {
  constructor(private readonly data: ApiCoreDataAccessService) {}

  create(auth: McpAuthContext): McpServer {
    const server = new McpServer({ name: 'nestled', version: '1.0.0' })
    const prisma = this.data as any

    registerOrganizationTools(server, prisma, auth)
    registerProfileTools(server, prisma, auth)

    return server
  }
}
