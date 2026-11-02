# MCP plugin

The API serves a remote MCP endpoint at `/api/mcp`, with its own OAuth authorization server so
remote connectors (for example a custom connector added in claude.ai) can connect with the user's
consent. Personal and organization API tokens created in settings also work as bearer tokens.

## Routes a remote connector reaches

All on the API origin (`VITE_API_URL`), not the web app:

| Path                                              | Purpose                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `/api/mcp`                                        | The MCP endpoint (Streamable HTTP).                                   |
| `/.well-known/oauth-protected-resource/api/mcp`   | Protected-resource metadata, named in the endpoint's `401` challenge. |
| `/.well-known/oauth-authorization-server/api/mcp` | Authorization-server metadata (RFC 8414).                             |
| `/.well-known/openid-configuration/api/mcp`       | The same metadata at the OpenID location clients also try.            |
| `/api/mcp/.well-known/*`                          | The same documents under the API prefix.                              |
| `/api/mcp/register`                               | Dynamic client registration (`POST`).                                 |
| `/api/mcp/authorize`, `/api/mcp/authorize/*`      | Authorization; the user signs in and approves in the browser.         |
| `/api/mcp/token`                                  | Token exchange and refresh (`POST`).                                  |
| `/api/mcp/jwks`                                   | Signing keys.                                                         |

The root `/.well-known/...` paths are rewritten to the `/api/mcp/.well-known/...` routes by
`mcpRootWellKnownRewrite` (mcp-well-known.ts), mounted in apps/api/src/main.ts.

## Behind Cloudflare: let MCP clients through bot protection

If the API hostname is proxied by Cloudflare (orange cloud) with bot protection on (Bot Fight
Mode, Super Bot Fight Mode, or a WAF rule that issues a managed or JS challenge), MCP clients
cannot connect. They are servers, not browsers: instead of JSON from the discovery, registration
or token routes they get Cloudflare's challenge page (HTML, often with a `403` or `503`), and the
connector fails with a vague "couldn't connect" or "invalid metadata" error. The API's own logs
show nothing, because the requests never reach it.

Fix it on the API hostname only, in one of two ways:

1. **DNS-only API hostname.** Set the API's DNS record to DNS only (grey cloud). Cloudflare no
   longer sits in front of the API, so nothing challenges the MCP routes. The API's own rate
   limits and auth still apply.
2. **A WAF skip rule.** Keep the API proxied and add a custom rule with the action **Skip** that
   skips the bot-protection and managed-challenge features for requests to the API hostname whose
   path is one of:
   - starts with `/api/mcp` (the endpoint, `/api/mcp/register`, `/api/mcp/authorize`,
     `/api/mcp/token`, `/api/mcp/jwks` and `/api/mcp/.well-known/*`);
   - starts with `/.well-known/oauth-` (the protected-resource and authorization-server
     metadata);
   - starts with `/.well-known/openid-configuration`.

   On plans where Bot Fight Mode cannot be skipped by a rule, turn Bot Fight Mode off for the
   zone, or use option 1.

Keep the **web app's** hostname proxied with whatever protection it has; only the API's MCP and
OAuth routes need to be reachable by non-browser clients. To check, run
`curl -i https://<api-host>/.well-known/oauth-protected-resource/api/mcp` from a server: it should
return `200` with JSON, not an HTML challenge.
