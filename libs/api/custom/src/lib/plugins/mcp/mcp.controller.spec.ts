import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpController } from './mcp.controller'
import { McpServerFactory } from './mcp-server.factory'

const MODERN = '2026-07-28'
const ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': MODERN,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'spec-client', version: '1.0.0' },
}

interface FakeUser {
  id: string
  isSuperAdmin?: boolean
  organizations?: unknown[]
}

interface CapturedResponse {
  status: number
  headers: Record<string, string>
  body: string
}

/** An Express-shaped response that records what the controller wrote. */
function createResponse() {
  const captured: CapturedResponse = { status: 200, headers: {}, body: '' }
  const res: any = {
    headersSent: false,
    status: jest.fn((code: number) => {
      captured.status = code
      return res
    }),
    header: jest.fn((name: string, value: string) => {
      captured.headers[name.toLowerCase()] = value
      return res
    }),
    json: jest.fn((value: unknown) => {
      captured.headers['content-type'] ??= 'application/json'
      captured.body = JSON.stringify(value)
      res.headersSent = true
      return res
    }),
    send: jest.fn((value?: unknown) => {
      captured.body = value === undefined ? '' : String(value)
      res.headersSent = true
      return res
    }),
  }
  return { res, captured }
}

/** An Express-shaped request, as the API's JSON body parser and token middleware leave it. */
function createRequest(options: {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  user?: FakeUser
  apiTokenOrganizationId?: string | null
}) {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers[name.toLowerCase()] = value
  }
  return {
    method: options.method ?? 'POST',
    protocol: 'https',
    originalUrl: '/api/mcp',
    headers,
    body: options.body,
    user: options.user,
    apiTokenOrganizationId: options.apiTokenOrganizationId,
    get: (name: string) =>
      headers[name.toLowerCase()] ?? (name === 'host' ? 'api.example.com' : undefined),
  } as any
}

/** A prisma stand-in with just what the template's tools read. */
function createData() {
  return {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'user-123', firstName: 'Ada', organizations: [] }),
    },
    organization: {
      findFirst: jest.fn().mockResolvedValue({ id: 'org-123', name: 'Example Org', members: [] }),
      findMany: jest.fn().mockResolvedValue([{ id: 'org-123', name: 'Example Org' }]),
      count: jest.fn().mockResolvedValue(1),
    },
    organizationMember: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  }
}

/**
 * Drives `controller.handle` through a real SDK client: the client's fetch is answered in-process by
 * the controller, exactly as Express would call it after the token middleware ran.
 */
function clientFetch(
  controller: McpController,
  caller: { user?: FakeUser; apiTokenOrganizationId?: string | null },
) {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, name) => {
      headers[name] = value
    })
    const req = createRequest({
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      ...caller,
    })
    const { res, captured } = createResponse()
    await controller.handle(req, res)
    return new Response(captured.status === 204 ? null : captured.body, {
      status: captured.status,
      headers: captured.headers,
    })
  }
}

async function connectClient(
  controller: McpController,
  caller: { user?: FakeUser; apiTokenOrganizationId?: string | null },
  versionNegotiation?: { mode: 'auto' } | { mode: { pin: string } },
) {
  const client = new Client(
    { name: 'spec-client', version: '1.0.0' },
    versionNegotiation ? { versionNegotiation } : {},
  )
  const transport = new StreamableHTTPClientTransport(new URL('https://api.example.com/api/mcp'), {
    fetch: clientFetch(controller, caller),
  })
  await client.connect(transport)
  return client
}

const modernHeaders = (method: string, name?: string) => ({
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': MODERN,
  'mcp-method': method,
  ...(name ? { 'mcp-name': name } : {}),
})

describe('McpController', () => {
  let data: ReturnType<typeof createData>
  let factory: McpServerFactory
  let controller: McpController

  beforeEach(() => {
    data = createData()
    factory = new McpServerFactory(data as any)
    controller = new McpController(factory)
  })

  afterEach(async () => {
    await controller.onModuleDestroy()
  })

  describe('HTTP surface', () => {
    it('accepts DELETE session cleanup requests', async () => {
      const { res } = createResponse()

      await controller.handle(createRequest({ method: 'DELETE' }), res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ ok: true })
    })

    it('rejects unsupported methods', async () => {
      const { res } = createResponse()

      await controller.handle(createRequest({ method: 'GET' }), res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res.header).toHaveBeenCalledWith('Allow', 'POST, DELETE')
      expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
    })
  })

  describe('token validation', () => {
    it('challenges an unauthenticated POST with the protected resource metadata URL', async () => {
      const { res } = createResponse()

      await controller.handle(
        createRequest({ headers: { 'x-forwarded-host': 'app.example.com' }, body: {} }),
        res,
      )

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Bearer realm="MCP", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/mcp"',
      )
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }))
    })

    it('marks a presented bearer token that authenticated no one as invalid_token', async () => {
      const { res } = createResponse()

      await controller.handle(
        createRequest({ headers: { authorization: `Bearer ${'a'.repeat(64)}` }, body: {} }),
        res,
      )

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Bearer realm="MCP", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/api/mcp", error="invalid_token"',
      )
    })

    it('refuses a 2026-07-28 request without a caller before any server is built', async () => {
      const create = jest.spyOn(factory, 'create')
      const { res } = createResponse()

      await controller.handle(
        createRequest({
          headers: modernHeaders('tools/list'),
          body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: ENVELOPE } },
        }),
        res,
      )

      expect(res.status).toHaveBeenCalledWith(401)
      expect(create).not.toHaveBeenCalled()
    })

    it('builds the server for the token caller and its organization, on both eras', async () => {
      const create = jest.spyOn(factory, 'create')
      const caller = {
        user: { id: 'user-123', isSuperAdmin: true },
        apiTokenOrganizationId: 'org-123',
      }

      const legacy = await connectClient(controller, caller)
      await legacy.listTools()
      await legacy.close()
      const modern = await connectClient(controller, caller, { mode: { pin: MODERN } })
      await modern.listTools()
      await modern.close()

      expect(create).toHaveBeenCalled()
      for (const [auth] of create.mock.calls) {
        expect(auth).toEqual({ userId: 'user-123', organizationId: 'org-123', isSuperAdmin: true })
      }
    })

    it('does not promote organization all-manage permissions to platform MCP access', async () => {
      const create = jest.spyOn(factory, 'create')
      const user = {
        id: 'user-123',
        organizations: [{ role: { permissions: [{ subject: 'all', action: 'manage' }] } }],
      }

      const client = await connectClient(controller, { user }, { mode: { pin: MODERN } })
      await client.listTools()
      await client.close()

      expect(create).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: null,
        isSuperAdmin: false,
      })
    })
  })

  describe('MCP 2026-07-28 (modern) transport', () => {
    const caller = { user: { id: 'user-123' }, apiTokenOrganizationId: 'org-123' }

    it('answers server/discover with the supported version, capabilities and server identity', async () => {
      const { res, captured } = createResponse()

      await controller.handle(
        createRequest({
          ...caller,
          headers: modernHeaders('server/discover'),
          body: { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: ENVELOPE } },
        }),
        res,
      )

      expect(captured.status).toBe(200)
      expect(captured.headers['content-type']).toContain('application/json')
      const { result } = JSON.parse(captured.body)
      expect(result.supportedVersions).toContain(MODERN)
      expect(result.capabilities).toEqual({ tools: { listChanged: false } })
      expect(result.resultType).toBe('complete')
      expect(result.ttlMs).toBe(0)
      expect(result.cacheScope).toBe('private')
      expect(result._meta['io.modelcontextprotocol/serverInfo']).toEqual({
        name: 'nestled',
        version: '1.0.0',
      })
    })

    it('negotiates the modern era from a client in auto mode (server/discover probe)', async () => {
      const client = await connectClient(controller, caller, { mode: 'auto' })

      expect(client.getProtocolEra()).toBe('modern')
      await client.close()
    })

    it('lists and calls tools with no initialize handshake', async () => {
      const client = await connectClient(controller, caller, { mode: { pin: MODERN } })

      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toEqual(['get_organization', 'get_profile'])

      const result = await client.callTool({ name: 'get_organization', arguments: {} })
      expect(result.isError).toBeFalsy()
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual(
        expect.objectContaining({ id: 'org-123' }),
      )
      expect(data.organization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-123', members: { some: { userId: 'user-123' } } },
        }),
      )
      await client.close()
    })

    it('validates tool arguments against the tool input schema', async () => {
      const client = await connectClient(
        controller,
        { user: { id: 'user-123' }, apiTokenOrganizationId: null },
        { mode: { pin: MODERN } },
      )

      const result = await client.callTool({
        name: 'list_organizations',
        arguments: { limit: 500 },
      })

      expect(result.isError).toBe(true)
      expect(data.organizationMember.findMany).not.toHaveBeenCalled()
      await client.close()
    })

    it('answers an unsupported protocol version with -32022 and the supported list', async () => {
      const { res, captured } = createResponse()
      const version = '2099-01-01'

      await controller.handle(
        createRequest({
          ...caller,
          headers: { ...modernHeaders('tools/list'), 'mcp-protocol-version': version },
          body: {
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/list',
            params: { _meta: { ...ENVELOPE, 'io.modelcontextprotocol/protocolVersion': version } },
          },
        }),
        res,
      )

      expect(captured.status).toBe(400)
      expect(JSON.parse(captured.body)).toEqual({
        jsonrpc: '2.0',
        id: 7,
        error: expect.objectContaining({
          code: -32022,
          data: { supported: [MODERN], requested: version },
        }),
      })
    })

    it('rejects a modern request whose required headers are missing with -32020', async () => {
      const { res, captured } = createResponse()

      await controller.handle(
        createRequest({
          ...caller,
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: { jsonrpc: '2.0', id: 8, method: 'tools/list', params: { _meta: ENVELOPE } },
        }),
        res,
      )

      expect(captured.status).toBe(400)
      expect(JSON.parse(captured.body).error.code).toBe(-32020)
    })

    it('refuses subscriptions/listen in-band instead of holding a stream open', async () => {
      const { res, captured } = createResponse()

      await controller.handle(
        createRequest({
          ...caller,
          headers: modernHeaders('subscriptions/listen'),
          body: {
            jsonrpc: '2.0',
            id: 9,
            method: 'subscriptions/listen',
            params: { _meta: ENVELOPE, notifications: { toolsListChanged: true } },
          },
        }),
        res,
      )

      expect(captured.status).toBe(200)
      expect(captured.headers['content-type']).toContain('application/json')
      expect(JSON.parse(captured.body).error.code).toBe(-32603)
    })
  })

  describe('2025-era (legacy) transport', () => {
    const caller = { user: { id: 'user-123' }, apiTokenOrganizationId: 'org-123' }

    it('completes the initialize handshake and serves tools to an older-revision client', async () => {
      const client = await connectClient(controller, caller)

      expect(client.getProtocolEra()).toBe('legacy')
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toEqual(['get_organization', 'get_profile'])
      const result = await client.callTool({ name: 'get_profile', arguments: {} })
      expect(result.isError).toBeFalsy()
      await client.close()
    })

    it('answers a hand-rolled JSON-only request with a plain JSON body', async () => {
      const { res, captured } = createResponse()

      await controller.handle(
        createRequest({
          ...caller,
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        }),
        res,
      )

      expect(captured.status).toBe(200)
      expect(captured.headers['content-type']).toBe('application/json')
      const body = JSON.parse(captured.body)
      expect(body.id).toBe(1)
      expect(body.result.tools).toHaveLength(2)
      expect(body.result.resultType).toBeUndefined()
    })

    it('answers a JSON-RPC batch with an array of responses', async () => {
      const { res, captured } = createResponse()

      await controller.handle(
        createRequest({
          ...caller,
          body: [
            { jsonrpc: '2.0', id: 1, method: 'tools/list' },
            { jsonrpc: '2.0', id: 2, method: 'ping' },
          ],
        }),
        res,
      )

      expect(captured.status).toBe(200)
      expect(JSON.parse(captured.body).map((response: { id: number }) => response.id)).toEqual([
        1, 2,
      ])
    })

    it('returns no content for notification-only requests', async () => {
      const { res } = createResponse()

      await controller.handle(
        createRequest({ ...caller, body: { jsonrpc: '2.0', method: 'notifications/initialized' } }),
        res,
      )

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('returns an internal error when request handling fails before headers are sent', async () => {
      const server = {
        connect: jest.fn().mockRejectedValue(new Error('connect failed')),
        close: jest.fn().mockResolvedValue(undefined),
      }
      jest.spyOn(factory, 'create').mockReturnValue(server as any)
      const { res } = createResponse()

      await controller.handle(
        createRequest({ ...caller, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }),
        res,
      )

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
      expect(server.close).toHaveBeenCalled()
    })
  })
})
