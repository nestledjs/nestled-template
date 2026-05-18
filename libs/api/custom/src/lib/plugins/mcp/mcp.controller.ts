import { Controller, All, Req, Res, Logger } from '@nestjs/common'
import { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { JSONRPCMessage, isJSONRPCRequest } from '@modelcontextprotocol/sdk/types.js'
import { McpServerFactory } from './mcp-server.factory'
import { McpAuthContext } from './mcp-auth'

interface UnrefableTimer {
  unref: () => void
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer !== 'object' || timer === null || !('unref' in timer)) return

  const maybeUnref = (timer as { unref?: unknown }).unref
  if (typeof maybeUnref === 'function') {
    ;(timer as UnrefableTimer).unref()
  }
}

/**
 * Minimal in-memory transport for a single JSON request/response cycle.
 * Uses POST-only JSON-RPC rather than SSE to work reliably behind CDNs that
 * kill long-lived connections (e.g. Railway/Fastly).
 */
class JsonRequestTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage, extra?: { requestInfo?: unknown }) => void

  private readonly pending = new Map<string | number, (msg: JSONRPCMessage) => void>()

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if ('id' in message && message.id !== null && message.id !== undefined) {
      const resolve = this.pending.get(message.id)
      if (resolve) {
        resolve(message)
        this.pending.delete(message.id)
      }
    }
  }

  async close(): Promise<void> {
    this.onclose?.()
  }

  async handleBody(body: unknown): Promise<JSONRPCMessage | JSONRPCMessage[] | null> {
    if (!body || typeof body !== 'object') throw new Error('Invalid request body')

    const messages: JSONRPCMessage[] = Array.isArray(body)
      ? (body as JSONRPCMessage[])
      : [body as JSONRPCMessage]

    const requestMessages = messages.filter(m => isJSONRPCRequest(m))

    const responsePromises = requestMessages.map(
      req =>
        new Promise<JSONRPCMessage>(resolve => {
          this.pending.set(req.id, resolve)
        }),
    )

    for (const msg of messages) {
      this.onmessage?.(msg)
    }

    if (responsePromises.length === 0) return null

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('MCP response timeout')), 30_000)
        unrefTimer(timeoutHandle)
      })
      const responses = await Promise.race([Promise.all(responsePromises), timeout])
      const [firstResponse] = responses

      return responses.length === 1 ? firstResponse : responses
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }
}

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name)

  constructor(private readonly factory: McpServerFactory) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    const method = req.method.toUpperCase()

    if (method === 'DELETE') {
      res.status(200).json({ ok: true })
      return
    }

    if (method !== 'POST') {
      res.status(405).header('Allow', 'POST, DELETE').json({ error: 'Method not allowed' })
      return
    }

    const user = (req as any).user
    if (!user) {
      const proto = (req.get('x-forwarded-proto') || req.protocol) as string
      const host = (req.get('x-forwarded-host') || req.get('host')) as string
      const resourceMetadataUrl = `${proto}://${host}/.well-known/oauth-protected-resource/api/mcp`
      res
        .status(401)
        .header(
          'WWW-Authenticate',
          `Bearer realm="MCP", resource_metadata="${resourceMetadataUrl}"`,
        )
        .json({
          error: 'Unauthorized',
          message: 'Authentication required. Use MCP OAuth or provide a Bearer API token.',
        })
      return
    }

    const auth: McpAuthContext = {
      userId: user.id,
      organizationId: (req as any).apiTokenOrganizationId ?? null,
      isAdmin:
        user.organizations?.some((m: any) =>
          m.role?.permissions?.some((p: any) => p.name === 'all:manage'),
        ) ?? false,
    }

    let server: McpServer | null = null
    const transport = new JsonRequestTransport()

    try {
      server = this.factory.create(auth)
      await server.connect(transport)
      const response = await transport.handleBody(req.body)
      if (response === null) {
        res.status(204).send()
      } else {
        res.status(200).header('Content-Type', 'application/json').json(response)
      }
    } catch (err) {
      this.logger.error('MCP request handling error', err)
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
    } finally {
      server?.close().catch(err => this.logger.error('MCP close error', err))
    }
  }
}
