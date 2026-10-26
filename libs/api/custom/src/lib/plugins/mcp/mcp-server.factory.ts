import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/server'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import type { PrismaClient } from '@nestled-template/api/prisma'
import { McpAuthContext } from './mcp-auth'
import { registerOrganizationTools } from './tools/organization'
import { registerProfileTools } from './tools/profile'

export const MCP_SERVER_INFO = { name: 'nestled', version: '1.0.0' } as const

@Injectable()
export class McpServerFactory {
  constructor(private readonly data: ApiCoreDataAccessService) {}

  /**
   * A fresh server per HTTP request, built for one caller. Nothing is shared between requests, so
   * any instance can answer any request.
   *
   * `listChanged` is advertised as false: the tool set is fixed for the life of a request and the
   * server never publishes change notifications. Advertising it would invite 2026-07-28 clients to
   * hold a `subscriptions/listen` stream open, which the endpoint refuses (see McpController).
   */
  create(auth: McpAuthContext): McpServer {
    const server = new McpServer(MCP_SERVER_INFO, {
      capabilities: { tools: { listChanged: false } },
    })
    const prisma = this.data as PrismaClient

    registerOrganizationTools(server, prisma, auth)
    registerProfileTools(server, prisma, auth)

    return server
  }
}
