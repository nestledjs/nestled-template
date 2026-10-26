import { MCP_ROOT_WELL_KNOWN_ROUTES, mcpRootWellKnownRewrite } from './mcp-well-known'

/** An Express-shaped request whose `path` follows `url`, as Express derives it. */
function createRequest(method: string, url: string) {
  return {
    method,
    url,
    get path() {
      return this.url.split('?')[0]
    },
  } as any
}

describe('mcpRootWellKnownRewrite', () => {
  it.each([...MCP_ROOT_WELL_KNOWN_ROUTES.entries()])(
    'serves %s from %s',
    (rootPath, prefixedPath) => {
      const req = createRequest('GET', rootPath)
      const next = jest.fn()

      mcpRootWellKnownRewrite(req, {} as any, next)

      expect(req.url).toBe(prefixedPath)
      expect(next).toHaveBeenCalledTimes(1)
    },
  )

  it('points the 401 challenge URL and the client probe order at existing routes', () => {
    expect(MCP_ROOT_WELL_KNOWN_ROUTES.get('/.well-known/oauth-protected-resource/api/mcp')).toBe(
      '/api/mcp/.well-known/oauth-protected-resource',
    )
    expect(MCP_ROOT_WELL_KNOWN_ROUTES.get('/.well-known/oauth-authorization-server/api/mcp')).toBe(
      '/api/mcp/.well-known/oauth-authorization-server',
    )
    expect(MCP_ROOT_WELL_KNOWN_ROUTES.get('/.well-known/openid-configuration/api/mcp')).toBe(
      '/api/mcp/.well-known/openid-configuration',
    )
  })

  it('keeps the query string', () => {
    const req = createRequest('GET', '/.well-known/oauth-protected-resource/api/mcp?x=1')

    mcpRootWellKnownRewrite(req, {} as any, jest.fn())

    expect(req.url).toBe('/api/mcp/.well-known/oauth-protected-resource?x=1')
  })

  it.each([
    ['another path', 'GET', '/.well-known/apple-app-site-association'],
    ['an object prototype key', 'GET', 'constructor'],
    ['a POST', 'POST', '/.well-known/oauth-protected-resource/api/mcp'],
  ])('leaves %s alone', (_label, method, url) => {
    const req = createRequest(method, url)
    const next = jest.fn()

    mcpRootWellKnownRewrite(req, {} as any, next)

    expect(req.url).toBe(url)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
