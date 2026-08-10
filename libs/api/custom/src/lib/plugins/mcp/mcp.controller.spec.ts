import { McpController } from './mcp.controller'

describe('McpController', () => {
  const createResponse = () => {
    const res: any = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      json: jest.fn(function (this: any, value: unknown) {
        this.headersSent = true
        return this
      }),
      send: jest.fn(function (this: any) {
        this.headersSent = true
        return this
      }),
    }
    return res
  }

  it('accepts DELETE session cleanup requests', async () => {
    const controller = new McpController({ create: jest.fn() } as any)
    const res = createResponse()

    await controller.handle({ method: 'DELETE' } as any, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
  })

  it('rejects unsupported methods', async () => {
    const controller = new McpController({ create: jest.fn() } as any)
    const res = createResponse()

    await controller.handle({ method: 'GET' } as any, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.header).toHaveBeenCalledWith('Allow', 'POST, DELETE')
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  it('returns OAuth metadata challenge for unauthenticated POST requests', async () => {
    const controller = new McpController({ create: jest.fn() } as any)
    const res = createResponse()
    const req = {
      method: 'POST',
      protocol: 'https',
      get: jest.fn((name: string) => {
        if (name === 'x-forwarded-host') return 'app.example.com'
        return undefined
      }),
    }

    await controller.handle(req as any, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.header).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer realm="MCP", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/mcp"',
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Unauthorized',
      }),
    )
  })

  it('handles JSON-RPC requests through a per-request transport', async () => {
    const server = {
      connect: jest.fn(async (transport: any) => {
        transport.onmessage = (message: any) => {
          transport.send({ jsonrpc: '2.0', id: message.id, result: { ok: true } })
        }
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }
    const factory = { create: jest.fn().mockReturnValue(server) }
    const controller = new McpController(factory as any)
    const res = createResponse()
    const req = {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      user: {
        id: 'user-123',
        isSuperAdmin: true,
      },
      apiTokenOrganizationId: 'org-123',
    }

    await controller.handle(req as any, res)

    expect(factory.create).toHaveBeenCalledWith({
      userId: 'user-123',
      organizationId: 'org-123',
      isSuperAdmin: true,
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/json')
    expect(res.json).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 1, result: { ok: true } })
    expect(server.close).toHaveBeenCalled()
  })

  it('does not promote organization all-manage permissions to platform MCP access', async () => {
    const server = {
      connect: jest.fn(async (transport: any) => {
        transport.onmessage = (message: any) => {
          transport.send({ jsonrpc: '2.0', id: message.id, result: { ok: true } })
        }
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }
    const factory = { create: jest.fn().mockReturnValue(server) }
    const controller = new McpController(factory as any)
    const res = createResponse()
    const req = {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      user: {
        id: 'user-123',
        organizations: [{ role: { permissions: [{ subject: 'all', action: 'manage' }] } }],
      },
    }

    await controller.handle(req as any, res)

    expect(factory.create).toHaveBeenCalledWith({
      userId: 'user-123',
      organizationId: null,
      isSuperAdmin: false,
    })
  })

  it('returns no content for notification-only requests', async () => {
    const server = {
      connect: jest.fn(async () => undefined),
      close: jest.fn().mockResolvedValue(undefined),
    }
    const controller = new McpController({ create: jest.fn().mockReturnValue(server) } as any)
    const res = createResponse()
    const req = {
      method: 'POST',
      body: { jsonrpc: '2.0', method: 'notifications/initialized' },
      user: { id: 'user-123', organizations: [] },
    }

    await controller.handle(req as any, res)

    expect(res.status).toHaveBeenCalledWith(204)
    expect(res.send).toHaveBeenCalled()
  })

  it('returns an internal error when request handling fails before headers are sent', async () => {
    const server = {
      connect: jest.fn().mockRejectedValue(new Error('connect failed')),
      close: jest.fn().mockResolvedValue(undefined),
    }
    const controller = new McpController({ create: jest.fn().mockReturnValue(server) } as any)
    const res = createResponse()
    const req = {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      user: { id: 'user-123', organizations: [] },
    }

    await controller.handle(req as any, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    expect(server.close).toHaveBeenCalled()
  })
})
