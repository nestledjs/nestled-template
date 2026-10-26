import { Controller, All, Req, Res, Logger, OnModuleDestroy } from '@nestjs/common'
import { Request, Response } from 'express'
import {
  createMcpHandler,
  isLegacyRequest,
  type AuthInfo,
  type McpHttpHandler,
  type McpRequestContext,
  type McpServer,
} from '@modelcontextprotocol/server'
import { McpServerFactory } from './mcp-server.factory'
import { McpAuthContext } from './mcp-auth'
import { JsonRequestTransport, sendWebResponse, toWebRequest } from './mcp-transport'
import { Public } from '@nestled-template/api/utils'
import { requestOrigin } from './mcp-resource'

type McpAuthenticatedRequest = Request & {
  user?: {
    id: string
    isSuperAdmin?: boolean
  }
  apiTokenOrganizationId?: string | null
}

/** Key under `AuthInfo.extra` that carries the caller into the per-request server factory. */
const MCP_AUTH_EXTRA_KEY = 'nestledMcpAuth'

function bearerToken(req: Request): string {
  const header = req.headers?.authorization ?? ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice('bearer '.length).trim() : ''
}

/**
 * The MCP endpoint. Every POST is served by a server built for that request and caller, and closed
 * when it has answered: no sessions, no `Mcp-Session-Id`, no long-lived connections, so any API
 * instance can answer any request and nothing is lost when one restarts.
 *
 * Two protocol eras share the endpoint:
 *
 * - 2026-07-28 requests (they carry the per-request `_meta` envelope) go to the v2 SDK's
 *   `createMcpHandler`, which implements `server/discover`, per-request version negotiation, the
 *   `Mcp-Method`/`Mcp-Name` header checks, `resultType` and the cache fields. It answers with one
 *   JSON body (`responseMode: 'json'`) and refuses `subscriptions/listen` (`maxSubscriptions: 0`),
 *   so no response is ever a held-open stream.
 * - 2025-era requests (`initialize`, then plain JSON-RPC) keep the behaviour existing clients
 *   already depend on, through {@link JsonRequestTransport}.
 */
// Authenticates via the MCP bearer token, not a session.
@Public()
@Controller('mcp')
export class McpController implements OnModuleDestroy {
  private readonly logger = new Logger(McpController.name)
  private readonly modernHandler: McpHttpHandler

  constructor(private readonly factory: McpServerFactory) {
    this.modernHandler = createMcpHandler((ctx: McpRequestContext) => this.buildModernServer(ctx), {
      legacy: 'reject',
      responseMode: 'json',
      maxSubscriptions: 0,
      onerror: err => this.logger.debug(`MCP request rejected: ${err.message}`),
    })
  }

  async onModuleDestroy() {
    await this.modernHandler.close()
  }

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

    const mcpReq = req as McpAuthenticatedRequest
    const user = mcpReq.user
    if (!user) {
      const resourceMetadataUrl = `${requestOrigin(req)}/.well-known/oauth-protected-resource/api/mcp`
      // A bearer token was sent but authenticated no one (unknown, revoked or expired): say so, so
      // the client re-authorizes instead of retrying the same token (RFC 6750 section 3.1).
      const tokenError = bearerToken(req) ? ', error="invalid_token"' : ''
      res
        .status(401)
        .header(
          'WWW-Authenticate',
          `Bearer realm="MCP", resource_metadata="${resourceMetadataUrl}"${tokenError}`,
        )
        .json({
          error: 'Unauthorized',
          message: 'Authentication required. Use MCP OAuth or provide a Bearer API token.',
        })
      return
    }

    const auth: McpAuthContext = {
      userId: user.id,
      organizationId: mcpReq.apiTokenOrganizationId ?? null,
      isSuperAdmin: Boolean(user.isSuperAdmin),
    }

    let webRequest: globalThis.Request
    try {
      webRequest = toWebRequest(req, requestOrigin(req))
    } catch {
      // A Host or X-Forwarded-Host that cannot form a URL (spaces, a bad port, ...).
      res.status(400).json({ error: 'Bad Request', message: 'Invalid request host' })
      return
    }

    try {
      if (await isLegacyRequest(webRequest, req.body)) {
        await this.handleLegacy(req, res, auth)
        return
      }

      const authInfo: AuthInfo = {
        token: bearerToken(req),
        clientId: auth.userId,
        scopes: [],
        extra: { [MCP_AUTH_EXTRA_KEY]: auth },
      }
      const webResponse = await this.modernHandler.fetch(webRequest, {
        authInfo,
        parsedBody: req.body,
      })
      await sendWebResponse(webResponse, res)
    } catch (err) {
      this.logger.error('MCP request handling error', err)
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
    }
  }

  /** The caller rides in on `authInfo`; a request without it never reaches here (401 above). */
  private buildModernServer(ctx: McpRequestContext): McpServer {
    const auth = ctx.authInfo?.extra?.[MCP_AUTH_EXTRA_KEY] as McpAuthContext | undefined
    if (!auth)
      throw new Error('MCP request reached the server factory without an authenticated caller')
    return this.factory.create(auth)
  }

  private async handleLegacy(req: Request, res: Response, auth: McpAuthContext) {
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
