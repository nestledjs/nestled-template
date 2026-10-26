import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { ThrottlerModule } from '@nestjs/throttler'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import * as express from 'express'
import { ApiTokenAuthMiddleware } from '../../middleware/api-token-auth.middleware'
import { ApiTokensService } from '../api-tokens/api-tokens.service'
import { McpController } from './mcp.controller'
import { McpOAuthController } from './mcp-oauth.controller'
import { McpOAuthService } from './mcp-oauth.service'
import { McpServerFactory } from './mcp-server.factory'
import { mcpRootWellKnownRewrite } from './mcp-well-known'
import { MCP_REGISTER_LIMIT } from './mcp-oauth.controller'

const VALID_TOKEN = 'ab'.repeat(32)
const REVOKED_TOKEN = 'cd'.repeat(32)
const BOUND_HERE_TOKEN = 'ef'.repeat(32)
const BOUND_ELSEWHERE_TOKEN = '12'.repeat(32)

/**
 * The MCP endpoint over real HTTP: Express, the API's `api` prefix, its JSON body parser, the
 * root-level discovery rewrite and the API-token middleware, wired in the order apps/api/src/main.ts
 * and app.module.ts use. Only the database and token store are stand-ins.
 */
describe('MCP over HTTP', () => {
  let app: INestApplication
  let origin: string

  const data = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-123', organizations: [] }),
    },
    organization: {
      findFirst: jest.fn().mockResolvedValue({ id: 'org-123', name: 'Example Org', members: [] }),
    },
    organizationMember: { count: jest.fn(), findFirst: jest.fn() },
    mcpOAuthClient: {
      create: jest.fn(async ({ data }: any) => data),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  }
  const apiTokens = {
    validateApiToken: jest.fn(async (token: string) => {
      const base = { tokenId: 'token-1', userId: 'user-123', organizationId: 'org-123' }
      if (token === VALID_TOKEN) return { ...base, resource: null }
      if (token === BOUND_HERE_TOKEN) return { ...base, resource: `${origin}/api/mcp` }
      if (token === BOUND_ELSEWHERE_TOKEN) {
        return { ...base, resource: 'https://other.example.com/api/mcp' }
      }
      return null
    }),
    generateApiToken: jest.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // As AuthModule configures it in the API: the `signup` throttler /register's guard uses.
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ name: 'signup', ttl: 3_600_000, limit: 3 }] }),
      ],
      controllers: [McpController, McpOAuthController],
      providers: [
        McpServerFactory,
        McpOAuthService,
        { provide: ApiCoreDataAccessService, useValue: data },
        { provide: ApiTokensService, useValue: apiTokens },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: JwtService, useValue: { verify: jest.fn() } },
      ],
    }).compile()

    app = moduleRef.createNestApplication({ bodyParser: false, logger: false })
    const tokenMiddleware = new ApiTokenAuthMiddleware(apiTokens as any, data as any)
    app.use(mcpRootWellKnownRewrite)
    app.use(express.json())
    app.use('/api/mcp', (req: express.Request, res: express.Response, next: express.NextFunction) =>
      tokenMiddleware.use(req, res, next),
    )
    app.setGlobalPrefix('api')
    await app.listen(0, '127.0.0.1')
    origin = (await app.getUrl()).replace('[::1]', '127.0.0.1')
  })

  afterAll(async () => {
    await app.close()
  })

  const connect = async (token: string, mode?: 'auto') => {
    const client = new Client(
      { name: 'http-spec', version: '1.0.0' },
      mode ? { versionNegotiation: { mode } } : {},
    )
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    )
    return client
  }

  it('serves protected resource metadata at the URL the 401 challenge names', async () => {
    const challenge = await fetch(`${origin}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(challenge.status).toBe(401)
    const header = challenge.headers.get('www-authenticate') ?? ''
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(header)?.[1] ?? ''
    expect(new URL(metadataUrl).pathname).toBe('/.well-known/oauth-protected-resource/api/mcp')

    const metadata = await fetch(`${origin}${new URL(metadataUrl).pathname}`)
    expect(metadata.status).toBe(200)
    expect(await metadata.json()).toEqual({
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${origin}/api/mcp`],
      bearer_methods_supported: ['header'],
    })
  })

  it.each([
    '/.well-known/oauth-authorization-server/api/mcp',
    '/.well-known/openid-configuration/api/mcp',
    '/api/mcp/.well-known/openid-configuration',
    '/api/mcp/.well-known/oauth-authorization-server',
  ])('serves authorization server metadata at %s', async path => {
    const response = await fetch(`${origin}${path}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        issuer: `${origin}/api/mcp`,
        registration_endpoint: `${origin}/api/mcp/register`,
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
      }),
    )
  })

  it('rate limits dynamic client registration per client IP', async () => {
    const register = () =>
      fetch(`${origin}/api/mcp/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: 'Spec', redirect_uris: ['https://c.example.com/cb'] }),
      })

    for (let i = 0; i < MCP_REGISTER_LIMIT; i += 1) {
      expect((await register()).status).toBe(201)
    }
    const refused = await register()

    expect(refused.status).toBe(429)
    expect(data.mcpOAuthClient.create).toHaveBeenCalledTimes(MCP_REGISTER_LIMIT)
  })

  it('answers a request whose forwarded host cannot form a URL with 400, not a 500', async () => {
    const response = await fetch(`${origin}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
        'x-forwarded-host': 'bad host:99999',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Bad Request', message: 'Invalid request host' })
  })

  it('answers a revoked or unknown token with 401 invalid_token', async () => {
    const response = await fetch(`${origin}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${REVOKED_TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it('accepts a token bound to this MCP endpoint, and refuses one bound elsewhere', async () => {
    const call = (token: string) =>
      fetch(`${origin}/api/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })

    expect((await call(BOUND_HERE_TOKEN)).status).toBe(200)
    const elsewhere = await call(BOUND_ELSEWHERE_TOKEN)
    expect(elsewhere.status).toBe(401)
    expect(elsewhere.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it('negotiates 2026-07-28 with server/discover and calls a tool', async () => {
    const client = await connect(VALID_TOKEN, 'auto')

    expect(client.getProtocolEra()).toBe('modern')
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name)).toEqual(['get_organization', 'get_profile'])
    const result = await client.callTool({ name: 'get_organization', arguments: {} })
    expect(result.isError).toBeFalsy()
    await client.close()
  })

  it('still serves a 2025-era client through initialize', async () => {
    const client = await connect(VALID_TOKEN)

    expect(client.getProtocolEra()).toBe('legacy')
    expect(client.getServerVersion()).toEqual({ name: 'nestled', version: '1.0.0' })
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(2)
    await client.close()
  })

  it('answers a hand-rolled initialize with plain JSON, as before', async () => {
    const response = await fetch(`${origin}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${VALID_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'curl', version: '1' },
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nestled', version: '1.0.0' },
      },
    })
  })
})
