import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { McpOAuthController } from './mcp-oauth.controller'
import { McpOAuthService } from './mcp-oauth.service'

describe('McpOAuthController', () => {
  let controller: McpOAuthController
  let oauth: jest.Mocked<McpOAuthService>
  let config: jest.Mocked<ConfigService>
  let jwtService: jest.Mocked<JwtService>

  const req = {
    cookies: {},
  } as any

  const createResponse = () =>
    ({
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
    }) as any

  beforeEach(() => {
    oauth = {
      getMcpBaseUrl: jest.fn().mockReturnValue('https://api.example.com/mcp'),
      registerClient: jest.fn().mockReturnValue({
        clientId: 'client-123',
        clientName: 'MCP Client',
        redirectUris: ['https://client.example.com/callback'],
      }),
      getClient: jest.fn(),
      validateOrgMembership: jest.fn(),
      countUserOrganizations: jest.fn(),
      resolveOrganizationId: jest.fn(),
      createAuthCode: jest.fn().mockReturnValue('auth-code-123'),
      consumeAuthCode: jest.fn(),
      verifyPkce: jest.fn(),
      createAccessToken: jest.fn(),
    } as any
    config = {
      get: jest.fn((key: string) => (key === 'siteUrl' ? 'https://app.example.com' : undefined)),
    } as any
    jwtService = {
      verify: jest.fn(),
    } as any
    controller = new McpOAuthController(oauth, config, jwtService)
  })

  it('returns OAuth metadata and protected resource metadata', () => {
    expect(controller.getOidcConfig(req)).toEqual(
      expect.objectContaining({
        issuer: 'https://api.example.com/mcp',
        authorization_endpoint: 'https://api.example.com/mcp/authorize',
        token_endpoint: 'https://api.example.com/mcp/token',
      }),
    )
    expect(controller.getOAuthServerMetadata(req)).toEqual(
      expect.objectContaining({
        registration_endpoint: 'https://api.example.com/mcp/register',
      }),
    )
    expect(controller.getProtectedResourceMetadata(req)).toEqual({
      resource: 'https://api.example.com/mcp',
      authorization_servers: ['https://api.example.com/mcp'],
      bearer_methods_supported: ['header'],
    })
    expect(controller.getJwks()).toEqual({ keys: [] })
  })

  it('registers dynamic clients with defaults', () => {
    const result = controller.register({})

    expect(oauth.registerClient).toHaveBeenCalledWith('MCP Client', [])
    expect(result).toEqual(
      expect.objectContaining({
        client_id: 'client-123',
        client_name: 'MCP Client',
        token_endpoint_auth_method: 'none',
      }),
    )
  })

  it('rejects authorize requests with missing required parameters', async () => {
    const res = createResponse()

    await controller.authorize({ client_id: 'client-123' } as any, req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'invalid_request',
      }),
    )
  })

  it('redirects unauthenticated users to login with the authorize URL', async () => {
    const res = createResponse()
    oauth.getClient.mockReturnValue({ clientId: 'client-123' } as any)

    await controller.authorize(
      {
        client_id: 'client-123',
        redirect_uri: 'https://client.example.com/callback',
        code_challenge: 'challenge',
        state: 'state-123',
      },
      req,
      res,
    )

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('https://app.example.com/login?redirect='),
    )
  })

  it('issues an auth code for a valid authenticated user and organization', async () => {
    const res = createResponse()
    oauth.getClient.mockReturnValue({ clientId: 'client-123' } as any)
    oauth.validateOrgMembership.mockResolvedValue(true)
    jwtService.verify.mockReturnValue({ userId: 'user-123' } as any)

    await controller.authorize(
      {
        client_id: 'client-123',
        redirect_uri: 'https://client.example.com/callback',
        code_challenge: 'challenge',
        org: 'org-123',
      },
      { ...req, cookies: { __session: 'cookie-token' } } as any,
      res,
    )

    expect(oauth.createAuthCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        organizationId: 'org-123',
        clientId: 'client-123',
      }),
    )
    expect(res.redirect).toHaveBeenCalledWith(
      'https://client.example.com/callback?code=auth-code-123',
    )
  })

  it('redirects multi-organization users to organization selection', async () => {
    const res = createResponse()
    oauth.getClient.mockReturnValue({ clientId: 'client-123' } as any)
    oauth.countUserOrganizations.mockResolvedValue(2)
    jwtService.verify.mockReturnValue({ userId: 'user-123' } as any)

    await controller.authorize(
      {
        client_id: 'client-123',
        redirect_uri: 'https://client.example.com/callback',
        code_challenge: 'challenge',
      },
      { ...req, cookies: { __session: 'cookie-token' } } as any,
      res,
    )

    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('https://app.example.com/mcp-connect?back='),
    )
    expect(oauth.createAuthCode).not.toHaveBeenCalled()
  })

  it('rejects token requests with invalid grant data', async () => {
    const res = createResponse()

    await controller.token({ grant_type: 'client_credentials' }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'unsupported_grant_type' })

    jest.clearAllMocks()
    await controller.token({ grant_type: 'authorization_code' }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'invalid_request',
      }),
    )
  })

  it('exchanges a valid authorization code for an access token', async () => {
    const res = createResponse()
    oauth.consumeAuthCode.mockReturnValue({
      clientId: 'client-123',
      redirectUri: 'https://client.example.com/callback',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      userId: 'user-123',
      organizationId: 'org-123',
      scope: 'openid',
    } as any)
    oauth.verifyPkce.mockReturnValue(true)
    oauth.createAccessToken.mockResolvedValue('api-token-123')

    await controller.token(
      {
        grant_type: 'authorization_code',
        code: 'auth-code-123',
        redirect_uri: 'https://client.example.com/callback',
        code_verifier: 'verifier',
        client_id: 'client-123',
      },
      res,
    )

    expect(res.json).toHaveBeenCalledWith({
      access_token: 'api-token-123',
      token_type: 'bearer',
      scope: 'openid',
    })
  })
})
