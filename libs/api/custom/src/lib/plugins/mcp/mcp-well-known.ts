import type { NextFunction, Request, Response } from 'express'

/**
 * Root-level discovery URLs for the MCP endpoint at `/api/mcp`, and the McpOAuthController route
 * that serves each one. RFC 9728 and RFC 8414 insert `/.well-known/...` between the origin and the
 * resource or issuer path, so these sit outside the API's `api` prefix:
 *
 * - `/.well-known/oauth-protected-resource/api/mcp` is the URL the endpoint's own `401` challenge
 *   names in `resource_metadata`, and the first one a client probes without a challenge.
 * - `/.well-known/oauth-authorization-server/api/mcp` and
 *   `/.well-known/openid-configuration/api/mcp` are the first two locations an MCP 2026-07-28
 *   client tries for the authorization server whose issuer is `<origin>/api/mcp`. (The third,
 *   `/api/mcp/.well-known/openid-configuration`, is already under the prefix.)
 */
export const MCP_ROOT_WELL_KNOWN_ROUTES: ReadonlyMap<string, string> = new Map([
  [
    '/.well-known/oauth-protected-resource/api/mcp',
    '/api/mcp/.well-known/oauth-protected-resource',
  ],
  [
    '/.well-known/oauth-authorization-server/api/mcp',
    '/api/mcp/.well-known/oauth-authorization-server',
  ],
  ['/.well-known/openid-configuration/api/mcp', '/api/mcp/.well-known/openid-configuration'],
])

/**
 * Express middleware, mounted in apps/api/src/main.ts ahead of routing, that serves the root-level
 * discovery URLs from the existing `/api/mcp/.well-known/*` routes by rewriting the request path.
 * No route is added: the documents, and their public-operation and guard-baseline entries, stay
 * those of McpOAuthController.
 */
export function mcpRootWellKnownRewrite(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const target = MCP_ROOT_WELL_KNOWN_ROUTES.get(req.path)
    if (target) {
      const queryStart = req.url.indexOf('?')
      req.url = queryStart === -1 ? target : `${target}${req.url.slice(queryStart)}`
    }
  }
  next()
}
