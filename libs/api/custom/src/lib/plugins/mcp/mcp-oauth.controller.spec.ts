import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash } from 'node:crypto'
import { McpOAuthController } from './mcp-oauth.controller'
import { McpOAuthService } from './mcp-oauth.service'
import { ApiTokensService } from '../api-tokens/api-tokens.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { BadRequestException } from '@nestjs/common'
import { ClientMetadataError } from './mcp-client-metadata'

// Obviously fake placeholders: the session "cookie" is never a real token, the JWT service is
// mocked to map it to claims.
const SESSION_COOKIE = 'fake-session'
const OTHER_SESSION_COOKIE = 'fake-other-session'
const VERIFIER = 'fake-pkce-verifier-for-tests-only-0000000000000'
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')
const REDIRECT_URI = 'https://client.example.com/callback'
const MCP_BASE = 'https://api.example.com/api/mcp'
const CIMD_CLIENT_ID = 'https://client.example.com/oauth/client.json'

/** The McpOAuthClient table, in memory: what DCR registrations are stored in. */
function createClientTable() {
  const rows = new Map<string, { id: string; clientName: string; redirectUris: string[] }>()
  return {
    rows,
    create: jest.fn(async ({ data }: any) => {
      rows.set(data.id, {
        id: data.id,
        clientName: data.clientName,
        redirectUris: data.redirectUris,
      })
      return rows.get(data.id)
    }),
    findUnique: jest.fn(async ({ where }: any) => rows.get(where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const row = rows.get(where.id)
      if (row) Object.assign(row, data)
      return { count: row ? 1 : 0 }
    }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  }
}

type Claims = {
  userId: string
  sessionId?: string
  authGeneration?: number
  isEmulating?: boolean
  originalAdminId?: string
}

describe('McpOAuthController', () => {
  let controller: McpOAuthController
  let oauth: McpOAuthService
  let data: any
  let apiTokens: { generateApiToken: jest.Mock }
  let jwtService: { verify: jest.Mock }
  let sessions: Record<string, Claims>
  let memberships: Array<{ organization: { id: string; name: string } }>
  let clientId: string

  const createResponse = () => {
    const res: any = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
      redirect: jest.fn(() => res),
      setHeader: jest.fn(() => res),
    }
    return res
  }

  const requestWith = (cookie?: string) =>
    ({
      cookies: cookie ? { __session: cookie } : {},
      protocol: 'https',
      get: (name: string) => (name === 'host' ? 'api.example.com' : undefined),
    }) as any

  const authorizeQuery = (overrides: Record<string, string | undefined> = {}) =>
    ({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      state: 'state-123',
      ...overrides,
    }) as any

  /** Runs /authorize for the signed-in session and returns the pending request id it created. */
  async function startAuthorization(cookie = SESSION_COOKIE, overrides = {}): Promise<string> {
    const res = createResponse()
    await controller.authorize(authorizeQuery(overrides), requestWith(cookie), res)
    const location = res.redirect.mock.calls[0]?.[0] as string
    expect(location).toMatch(/^https:\/\/app\.example\.com\/mcp-connect\?request=/)
    return new URL(location).searchParams.get('request') as string
  }

  async function readPending(requestId: string, cookie = SESSION_COOKIE) {
    const res = createResponse()
    await controller.getPendingAuthorization(requestId, requestWith(cookie), res)
    return res
  }

  async function decide(body: Record<string, unknown>, cookie = SESSION_COOKIE) {
    const res = createResponse()
    await controller.decideAuthorization(body, requestWith(cookie), res)
    return res
  }

  beforeEach(async () => {
    sessions = {
      [SESSION_COOKIE]: { userId: 'user-123', sessionId: 'session-1', authGeneration: 3 },
      [OTHER_SESSION_COOKIE]: { userId: 'user-123', sessionId: 'session-2', authGeneration: 3 },
    }
    memberships = [{ organization: { id: 'org-123', name: 'Acme' } }]
    data = {
      user: {
        findUnique: jest.fn(({ select }: any) =>
          select.emails
            ? { firstName: 'Ada', lastName: 'Lovelace', emails: [{ email: 'ada@example.com' }] }
            : { id: 'user-123', authGeneration: 3 },
        ),
      },
      userSession: {
        findUnique: jest.fn().mockResolvedValue({ isValid: true, userId: 'user-123' }),
      },
      mcpOAuthClient: createClientTable(),
      organizationMember: {
        findMany: jest.fn(async () => memberships),
        findFirst: jest.fn(async ({ where }: any) =>
          memberships.some(m => m.organization.id === where.organizationId) ? { id: 'm-1' } : null,
        ),
      },
    }
    apiTokens = { generateApiToken: jest.fn().mockResolvedValue({ token: 'fake-api-token' }) }
    const config = {
      get: jest.fn((key: string) => (key === 'siteUrl' ? 'https://app.example.com' : undefined)),
    } as unknown as ConfigService
    jwtService = {
      verify: jest.fn((token: string) => {
        const claims = sessions[token]
        if (!claims) throw new Error('invalid token')
        return claims
      }),
    }
    oauth = new McpOAuthService(
      config,
      apiTokens as unknown as ApiTokensService,
      data as ApiCoreDataAccessService,
    )
    controller = new McpOAuthController(oauth, config, jwtService as unknown as JwtService)
    clientId = (await oauth.registerClient('Some MCP Client', [REDIRECT_URI])).clientId
  })

  describe('discovery and registration', () => {
    it('returns OAuth metadata and protected resource metadata', () => {
      const req = requestWith()
      expect(controller.getOidcConfig(req)).toEqual(
        expect.objectContaining({
          issuer: 'https://api.example.com/api/mcp',
          authorization_endpoint: 'https://api.example.com/api/mcp/authorize',
          token_endpoint: 'https://api.example.com/api/mcp/token',
          code_challenge_methods_supported: ['S256'],
        }),
      )
      expect(controller.getOAuthServerMetadata(req)).toEqual(
        expect.objectContaining({
          registration_endpoint: 'https://api.example.com/api/mcp/register',
        }),
      )
      expect(controller.getProtectedResourceMetadata(req)).toEqual({
        resource: 'https://api.example.com/api/mcp',
        authorization_servers: ['https://api.example.com/api/mcp'],
        bearer_methods_supported: ['header'],
      })
      expect(controller.getJwks()).toEqual({ keys: [] })
    })

    it('registers dynamic clients with defaults', async () => {
      // #64: a registration must name at least one acceptable redirect URI.
      const result = await controller.register({ redirect_uris: [REDIRECT_URI] })
      expect(result).toEqual(
        expect.objectContaining({
          client_name: 'MCP Client',
          redirect_uris: [REDIRECT_URI],
          token_endpoint_auth_method: 'none',
        }),
      )
    })

    it('stores registrations, so another instance (or a restart) still knows the client', async () => {
      const result = await controller.register({
        client_name: 'Desktop Client',
        redirect_uris: ['http://127.0.0.1:33418/callback'],
      })

      expect(data.mcpOAuthClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            id: result.client_id,
            clientName: 'Desktop Client',
            redirectUris: ['http://127.0.0.1:33418/callback'],
          },
        }),
      )
      const otherInstance = new McpOAuthService(
        { get: jest.fn() } as unknown as ConfigService,
        apiTokens as unknown as ApiTokensService,
        data as ApiCoreDataAccessService,
      )
      await expect(otherInstance.getClient(result.client_id)).resolves.toEqual({
        clientId: result.client_id,
        clientName: 'Desktop Client',
        redirectUris: ['http://127.0.0.1:33418/callback'],
      })
    })

    it.each([
      ['no redirect_uris', {}],
      ['an empty list', { redirect_uris: [] }],
      ['plain http to a remote host', { redirect_uris: ['http://client.example.com/cb'] }],
      ['a script scheme', { redirect_uris: ['javascript:alert(1)'] }],
      [
        'too many redirect URIs',
        { redirect_uris: Array.from({ length: 11 }, (_, i) => `https://c.example.com/${i}`) },
      ],
    ])('refuses a registration with %s as invalid_redirect_uri', async (_label, body) => {
      const error = await controller.register(body).catch(err => err)
      expect(error).toBeInstanceOf(BadRequestException)
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ error: 'invalid_redirect_uri' }),
      )
      expect(data.mcpOAuthClient.create).toHaveBeenCalledTimes(1) // only the beforeEach client
    })

    it('advertises CIMD, RFC 9207 iss and keeps the DCR endpoint', () => {
      expect(controller.getOAuthServerMetadata(requestWith())).toEqual(
        expect.objectContaining({
          client_id_metadata_document_supported: true,
          authorization_response_iss_parameter_supported: true,
          registration_endpoint: `${MCP_BASE}/register`,
        }),
      )
    })
  })

  describe('authorize', () => {
    it('rejects requests with missing required parameters', async () => {
      const res = createResponse()
      await controller.authorize({ client_id: clientId } as any, requestWith(SESSION_COOKIE), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_request' }))
    })

    it.each([
      ['plain', { code_challenge_method: 'plain', code_challenge: VERIFIER }],
      ['a missing code_challenge_method', { code_challenge_method: undefined }],
      ['a missing code_challenge', { code_challenge: undefined }],
      ['a malformed code_challenge', { code_challenge: 'short' }],
    ])('rejects PKCE with %s as invalid_request', async (_label, overrides) => {
      const res = createResponse()
      await controller.authorize(authorizeQuery(overrides), requestWith(SESSION_COOKIE), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_request' }))
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it('rejects a repeated parameter', async () => {
      const res = createResponse()
      await controller.authorize(
        authorizeQuery({ redirect_uri: [REDIRECT_URI, 'https://evil.example.com/cb'] as any }),
        requestWith(SESSION_COOKIE),
        res,
      )
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it('rejects an unknown client', async () => {
      const res = createResponse()
      await controller.authorize(
        authorizeQuery({ client_id: 'unknown' }),
        requestWith(SESSION_COOKIE),
        res,
      )
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_client' }))
    })

    it('rejects a redirect_uri with a script scheme', async () => {
      const res = createResponse()
      await controller.authorize(
        authorizeQuery({ redirect_uri: 'javascript:alert(1)' }),
        requestWith(SESSION_COOKIE),
        res,
      )
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it('redirects unauthenticated users to login with the authorize URL', async () => {
      const res = createResponse()
      await controller.authorize(authorizeQuery(), requestWith(), res)
      const location = res.redirect.mock.calls[0][0] as string
      expect(location).toContain('https://app.example.com/login?redirect=')
      const back = new URL(new URL(location).searchParams.get('redirect') as string)
      expect(back.searchParams.get('code_challenge_method')).toBe('S256')
      expect(back.searchParams.get('state')).toBe('state-123')
    })

    it('sends the user to login when the cookie session is no longer current', async () => {
      data.userSession.findUnique.mockResolvedValue({ isValid: false, userId: 'user-123' })
      const res = createResponse()
      await controller.authorize(authorizeQuery(), requestWith(SESSION_COOKIE), res)
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://app.example.com/login?redirect='),
      )
    })

    it('refuses to authorize a client from an emulation session', async () => {
      sessions[SESSION_COOKIE] = {
        userId: 'user-123',
        sessionId: 'emulation-session',
        isEmulating: true,
        originalAdminId: 'admin-1',
      }
      // The emulation session itself is current; what is refused is authorizing from it.
      jest.spyOn(oauth, 'isSessionTokenCurrent').mockResolvedValue(true)
      const res = createResponse()
      await controller.authorize(authorizeQuery(), requestWith(SESSION_COOKIE), res)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'access_denied' }))
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it('rejects an org= the user does not belong to', async () => {
      const res = createResponse()
      await controller.authorize(
        authorizeQuery({ org: 'org-other' }),
        requestWith(SESSION_COOKIE),
        res,
      )
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it.each([
      ['single-organization', [{ organization: { id: 'org-123', name: 'Acme' } }]],
      [
        'multi-organization',
        [
          { organization: { id: 'org-123', name: 'Acme' } },
          { organization: { id: 'org-456', name: 'Globex' } },
        ],
      ],
      ['organization-less', []],
    ])('issues no code to a %s user without approval', async (_label, orgs) => {
      memberships = orgs
      const createAuthCode = jest.spyOn(oauth, 'createAuthCode')
      const res = createResponse()

      await controller.authorize(authorizeQuery(), requestWith(SESSION_COOKIE), res)

      expect(createAuthCode).not.toHaveBeenCalled()
      const location = res.redirect.mock.calls[0][0] as string
      expect(location).toMatch(/^https:\/\/app\.example\.com\/mcp-connect\?request=[\w-]{43}$/)
      expect(location).not.toContain(REDIRECT_URI)
      expect(location).not.toContain('code=')
    })
  })

  describe('pending authorization details', () => {
    it('shows the client as unverified, the redirect host, the account and the organizations', async () => {
      const requestId = await startAuthorization(SESSION_COOKIE, { org: 'org-123' })
      const res = await readPending(requestId)

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          request: requestId,
          csrfToken: expect.any(String),
          client: { name: 'Some MCP Client', verified: false },
          redirectUri: REDIRECT_URI,
          redirectHost: 'client.example.com',
          account: { name: 'Ada Lovelace', email: 'ada@example.com' },
          organizations: [{ id: 'org-123', name: 'Acme' }],
          selectedOrganizationId: 'org-123',
        }),
      )
    })

    it('requires a session', async () => {
      const requestId = await startAuthorization()
      const res = await readPending(requestId, '')
      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('is not shown to a different session of the same user', async () => {
      const requestId = await startAuthorization()
      const res = await readPending(requestId, OTHER_SESSION_COOKIE)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ csrfToken: expect.anything() }),
      )
    })

    it('answers 404 for an unknown or expired request', async () => {
      expect((await readPending('no-such-request')).status).toHaveBeenCalledWith(404)

      const requestId = await startAuthorization()
      const later = Date.now() + oauth.PENDING_TTL_MS + 1000
      const now = jest.spyOn(Date, 'now').mockReturnValue(later)
      try {
        expect((await readPending(requestId)).status).toHaveBeenCalledWith(404)
      } finally {
        now.mockRestore()
      }
    })
  })

  describe('decision', () => {
    async function pendingWithCsrf(cookie = SESSION_COOKIE) {
      const requestId = await startAuthorization(cookie)
      const res = await readPending(requestId, cookie)
      return { requestId, csrfToken: res.json.mock.calls[0][0].csrfToken as string }
    }

    it('redirects a denial with access_denied and the state', async () => {
      const createAuthCode = jest.spyOn(oauth, 'createAuthCode')
      const { requestId, csrfToken } = await pendingWithCsrf()

      const res = await decide({ request: requestId, csrf_token: csrfToken, decision: 'deny' })

      expect(createAuthCode).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith({
        // #64: RFC 9207 iss on denials too.
        redirect_to: `${REDIRECT_URI}?error=access_denied&iss=${encodeURIComponent(MCP_BASE)}&state=state-123`,
      })
    })

    it('rejects approval without a pending record', async () => {
      const res = await decide({ request: 'no-such-request', csrf_token: 'x', decision: 'approve' })
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ redirect_to: expect.anything() }),
      )
    })

    it.each([
      ['a missing CSRF token', undefined],
      ['a wrong CSRF token', 'fake-wrong-csrf-token'],
    ])('rejects approval with %s', async (_label, csrf) => {
      const createAuthCode = jest.spyOn(oauth, 'createAuthCode')
      const { requestId } = await pendingWithCsrf()

      const res = await decide({
        request: requestId,
        csrf_token: csrf,
        decision: 'approve',
        organization_id: 'org-123',
      })

      expect(res.status).toHaveBeenCalledWith(403)
      expect(createAuthCode).not.toHaveBeenCalled()
    })

    it('rejects approval without a session', async () => {
      const createAuthCode = jest.spyOn(oauth, 'createAuthCode')
      const { requestId, csrfToken } = await pendingWithCsrf()

      const res = await decide(
        {
          request: requestId,
          csrf_token: csrfToken,
          decision: 'approve',
          organization_id: 'org-123',
        },
        '',
      )

      expect(res.status).toHaveBeenCalledWith(401)
      expect(createAuthCode).not.toHaveBeenCalled()
    })

    it('rejects approval from a session other than the one that made the request', async () => {
      const createAuthCode = jest.spyOn(oauth, 'createAuthCode')
      const { requestId, csrfToken } = await pendingWithCsrf()

      const res = await decide(
        {
          request: requestId,
          csrf_token: csrfToken,
          decision: 'approve',
          organization_id: 'org-123',
        },
        OTHER_SESSION_COOKIE,
      )

      expect(res.status).toHaveBeenCalledWith(403)
      expect(createAuthCode).not.toHaveBeenCalled()
    })

    it('rejects approval from an emulation session', async () => {
      const { requestId, csrfToken } = await pendingWithCsrf()
      sessions[SESSION_COOKIE] = {
        ...sessions[SESSION_COOKIE],
        isEmulating: true,
        originalAdminId: 'admin-1',
      }
      jest.spyOn(oauth, 'isSessionTokenCurrent').mockResolvedValue(true)

      const res = await decide({ request: requestId, csrf_token: csrfToken, decision: 'approve' })

      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('cannot be replayed', async () => {
      const { requestId, csrfToken } = await pendingWithCsrf()
      const body = {
        request: requestId,
        csrf_token: csrfToken,
        decision: 'approve',
        organization_id: 'org-123',
      }

      const first = await decide(body)
      expect(first.json).toHaveBeenCalledWith({ redirect_to: expect.stringContaining('code=') })

      const second = await decide(body)
      expect(second.status).toHaveBeenCalledWith(400)
      expect(second.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ redirect_to: expect.anything() }),
      )
    })

    it('is used up by a failed attempt, so a guessed CSRF token cannot be retried', async () => {
      const { requestId, csrfToken } = await pendingWithCsrf()
      await decide({ request: requestId, csrf_token: 'fake-guess', decision: 'approve' })

      const res = await decide({
        request: requestId,
        csrf_token: csrfToken,
        decision: 'approve',
        organization_id: 'org-123',
      })

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('rejects an organization the user does not belong to', async () => {
      const createAuthCode = jest.spyOn(oauth, 'createAuthCode')
      const { requestId, csrfToken } = await pendingWithCsrf()

      const res = await decide({
        request: requestId,
        csrf_token: csrfToken,
        decision: 'approve',
        organization_id: 'org-other',
      })

      expect(res.status).toHaveBeenCalledWith(400)
      expect(createAuthCode).not.toHaveBeenCalled()
    })

    it('rejects an unknown decision', async () => {
      const { requestId, csrfToken } = await pendingWithCsrf()
      const res = await decide({ request: requestId, csrf_token: csrfToken, decision: 'yes' })
      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('full flow', () => {
    async function approveAndExchange(organizationId: string | undefined) {
      const requestId = await startAuthorization()
      const pending = await readPending(requestId)
      const { csrfToken } = pending.json.mock.calls[0][0]

      const decision = await decide({
        request: requestId,
        csrf_token: csrfToken,
        decision: 'approve',
        organization_id: organizationId,
      })
      const redirectTo = new URL(decision.json.mock.calls[0][0].redirect_to)
      expect(`${redirectTo.origin}${redirectTo.pathname}`).toBe(REDIRECT_URI)
      expect(redirectTo.searchParams.get('state')).toBe('state-123')
      const code = redirectTo.searchParams.get('code') as string
      expect(code).toBeTruthy()

      const tokenRes = createResponse()
      await controller.token(
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: VERIFIER,
          client_id: clientId,
        },
        tokenRes,
      )
      return tokenRes
    }

    it('issues a code on approval and exchanges it for a token', async () => {
      const tokenRes = await approveAndExchange('org-123')

      expect(apiTokens.generateApiToken).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ organizationId: 'org-123' }),
        3,
        { resource: MCP_BASE },
      )
      expect(tokenRes.json).toHaveBeenCalledWith({
        access_token: 'fake-api-token',
        token_type: 'bearer',
        scope: 'openid',
      })
    })

    it('lets a multi-organization user choose the organization', async () => {
      memberships = [
        { organization: { id: 'org-123', name: 'Acme' } },
        { organization: { id: 'org-456', name: 'Globex' } },
      ]
      await approveAndExchange('org-456')
      expect(apiTokens.generateApiToken).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ organizationId: 'org-456' }),
        3,
        { resource: MCP_BASE },
      )
    })

    it('grants an organization-less user a token with no organization', async () => {
      memberships = []
      await approveAndExchange(undefined)
      expect(apiTokens.generateApiToken).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ organizationId: undefined }),
        3,
        { resource: MCP_BASE },
      )
    })

    it('refuses the code with the wrong PKCE verifier', async () => {
      const requestId = await startAuthorization()
      const { csrfToken } = (await readPending(requestId)).json.mock.calls[0][0]
      const decision = await decide({
        request: requestId,
        csrf_token: csrfToken,
        decision: 'approve',
        organization_id: 'org-123',
      })
      const code = new URL(decision.json.mock.calls[0][0].redirect_to).searchParams.get('code')

      const tokenRes = createResponse()
      await controller.token(
        {
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: REDIRECT_URI,
          code_verifier: 'fake-wrong-verifier',
          client_id: clientId,
        },
        tokenRes,
      )
      expect(tokenRes.status).toHaveBeenCalledWith(400)
      expect(apiTokens.generateApiToken).not.toHaveBeenCalled()
    })
  })

  /** Approve a started request and return the redirect the client is sent to. */
  async function approve(requestId: string, organizationId: string | undefined = 'org-123') {
    const { csrfToken } = (await readPending(requestId)).json.mock.calls[0][0]
    const res = await decide({
      request: requestId,
      csrf_token: csrfToken,
      decision: 'approve',
      organization_id: organizationId,
    })
    return new URL(res.json.mock.calls[0][0].redirect_to)
  }

  async function exchange(code: string, overrides: Record<string, string> = {}) {
    const res = createResponse()
    await controller.token(
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
        client_id: clientId,
        ...overrides,
      },
      res,
    )
    return res
  }

  describe('registered redirect URIs (#64)', () => {
    it('records the client as used when it redeems a code', async () => {
      const redirect = await approve(await startAuthorization())
      data.mcpOAuthClient.updateMany.mockClear()

      await exchange(redirect.searchParams.get('code') as string)

      expect(data.mcpOAuthClient.updateMany).toHaveBeenCalledWith({
        where: { id: clientId },
        data: { lastUsedAt: expect.any(Date) },
      })
    })

    it('refuses a redirect_uri the client did not register, before sign-in and after', async () => {
      for (const cookie of [undefined, SESSION_COOKIE]) {
        const res = createResponse()
        await controller.authorize(
          authorizeQuery({ redirect_uri: 'https://attacker.example.com/callback' }),
          requestWith(cookie),
          res,
        )
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_request' }))
        expect(res.redirect).not.toHaveBeenCalled()
      }
    })

    it('lets a loopback redirect use another port (RFC 8252)', async () => {
      clientId = (await oauth.registerClient('CLI', ['http://127.0.0.1:33418/callback'])).clientId

      const requestId = await startAuthorization(SESSION_COOKIE, {
        redirect_uri: 'http://127.0.0.1:51234/callback',
      })

      expect(requestId).toBeTruthy()
    })

    it('checks the client and redirect before the pending authorization is created', async () => {
      const order: string[] = []
      jest.spyOn(oauth, 'resolveClientForRedirect').mockImplementation(async () => {
        order.push('resolve')
        return { clientId, clientName: 'Some MCP Client', redirectUris: [REDIRECT_URI] }
      })
      const createPending = oauth.createPendingAuthorization.bind(oauth)
      jest.spyOn(oauth, 'createPendingAuthorization').mockImplementation(params => {
        order.push('pending')
        return createPending(params)
      })

      await startAuthorization()

      // Once before sign-in (the DCR record and redirect), once after, then the pending record.
      expect(order).toEqual(['resolve', 'resolve', 'pending'])
    })
  })

  describe('RFC 9207 iss (#64)', () => {
    it('names the issuer on an approval redirect', async () => {
      const redirect = await approve(await startAuthorization())

      expect(redirect.searchParams.get('iss')).toBe(MCP_BASE)
      expect(redirect.searchParams.get('code')).toEqual(expect.any(String))
      expect(redirect.searchParams.get('state')).toBe('state-123')
    })

    it('names the issuer the client saw, even when the decision arrives through another host', async () => {
      const requestId = await startAuthorization()
      const { csrfToken } = (await readPending(requestId)).json.mock.calls[0][0]
      const internal = {
        ...requestWith(SESSION_COOKIE),
        get: (name: string) => (name === 'host' ? 'api.internal:3000' : undefined),
      }
      const res = createResponse()

      await controller.decideAuthorization(
        { request: requestId, csrf_token: csrfToken, decision: 'deny' },
        internal as any,
        res,
      )

      expect(new URL(res.json.mock.calls[0][0].redirect_to).searchParams.get('iss')).toBe(MCP_BASE)
    })
  })

  describe('Client ID Metadata Documents (#64)', () => {
    let resolveMetadata: jest.SpyInstance
    const document = {
      clientId: CIMD_CLIENT_ID,
      clientName: 'Example Client',
      redirectUris: [REDIRECT_URI],
    }

    beforeEach(() => {
      resolveMetadata = jest.spyOn((oauth as any).clientMetadata, 'resolve')
      clientId = CIMD_CLIENT_ID
    })

    it('does not fetch the metadata document before the user has signed in', async () => {
      const res = createResponse()
      await controller.authorize(authorizeQuery(), requestWith(), res)

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://app.example.com/login?redirect='),
      )
      expect(resolveMetadata).not.toHaveBeenCalled()
    })

    it('runs a CIMD client through consent and the token endpoint', async () => {
      resolveMetadata.mockResolvedValue(document)
      const requestId = await startAuthorization()

      const pending = (await readPending(requestId)).json.mock.calls[0][0]
      // The document's name is self-asserted: nothing checked its origin, so it is not verified.
      expect(pending.client).toEqual({ name: 'Example Client', verified: false })

      const redirect = await approve(requestId)
      const tokenRes = await exchange(redirect.searchParams.get('code') as string)

      expect(resolveMetadata).toHaveBeenCalledWith(CIMD_CLIENT_ID)
      expect(tokenRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'fake-api-token' }),
      )
    })

    it('refuses a redirect_uri the metadata document does not list', async () => {
      resolveMetadata.mockResolvedValue({
        ...document,
        redirectUris: ['https://other.example.com/cb'],
      })
      const create = jest.spyOn(oauth, 'createPendingAuthorization')
      const res = createResponse()

      await controller.authorize(authorizeQuery(), requestWith(SESSION_COOKIE), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_request' }))
      expect(create).not.toHaveBeenCalled()
    })

    it('answers a document that fails validation as invalid_client', async () => {
      resolveMetadata.mockRejectedValue(
        new ClientMetadataError('Client metadata document client_id does not match its URL'),
      )
      const res = createResponse()

      await controller.authorize(authorizeQuery(), requestWith(SESSION_COOKIE), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        error: 'invalid_client',
        error_description: 'Client metadata document client_id does not match its URL',
      })
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it('refuses a code presented by another client', async () => {
      resolveMetadata.mockResolvedValue(document)
      const redirect = await approve(await startAuthorization())

      const res = await exchange(redirect.searchParams.get('code') as string, {
        client_id: 'https://other.example.com/client.json',
      })

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'invalid_client' })
    })
  })

  describe('RFC 8707 resource binding (#64)', () => {
    it.each([
      ['omitted', undefined],
      ['this endpoint', MCP_BASE],
      [
        'this endpoint with a trailing slash and an uppercase host',
        'https://API.example.com/api/mcp/',
      ],
    ])('binds the token to this MCP endpoint when resource is %s', async (_label, resource) => {
      const redirect = await approve(await startAuthorization(SESSION_COOKIE, { resource }))
      await exchange(redirect.searchParams.get('code') as string, resource ? { resource } : {})

      expect(apiTokens.generateApiToken).toHaveBeenCalledWith('user-123', expect.anything(), 3, {
        resource: MCP_BASE,
      })
    })

    it.each([
      'https://other.example.com/api/mcp',
      'https://api.example.com/api/graphql',
      'https://api.example.com/api/mcp#fragment',
      'not a url',
    ])('refuses an authorization for resource %s as invalid_target', async resource => {
      const res = createResponse()

      await controller.authorize(authorizeQuery({ resource }), requestWith(SESSION_COOKIE), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_target' }))
      expect(res.redirect).not.toHaveBeenCalled()
    })

    it('refuses a token request naming another resource than the code was issued for', async () => {
      const redirect = await approve(await startAuthorization())

      const res = await exchange(redirect.searchParams.get('code') as string, {
        resource: 'https://other.example.com/api/mcp',
      })

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_target' }))
      expect(apiTokens.generateApiToken).not.toHaveBeenCalled()
    })

    it('keeps resource through the login redirect', async () => {
      const res = createResponse()
      await controller.authorize(authorizeQuery({ resource: MCP_BASE }), requestWith(), res)

      const back = new URL(
        new URL(res.redirect.mock.calls[0][0]).searchParams.get('redirect') as string,
      )
      expect(back.searchParams.get('resource')).toBe(MCP_BASE)
    })
  })

  describe('token', () => {
    it('rejects token requests with invalid grant data', async () => {
      const res = createResponse()
      await controller.token({ grant_type: 'client_credentials' }, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'unsupported_grant_type' })

      const res2 = createResponse()
      await controller.token({ grant_type: 'authorization_code' }, res2)
      expect(res2.status).toHaveBeenCalledWith(400)
      expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_request' }))
    })
  })
})
