import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes, createHash } from 'node:crypto'
import { ApiTokensService } from '../api-tokens/api-tokens.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

export interface StoredAuthCode {
  userId: string
  organizationId: string | null
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  scope: string
  expiresAt: Date
}

export interface OAuthClient {
  clientId: string
  clientName: string
  redirectUris: string[]
}

@Injectable()
export class McpOAuthService {
  private readonly logger = new Logger(McpOAuthService.name)
  private readonly authCodes = new Map<string, StoredAuthCode>()
  private readonly clients = new Map<string, OAuthClient>()
  private readonly CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  constructor(
    private readonly config: ConfigService,
    private readonly apiTokensService: ApiTokensService,
    private readonly data: ApiCoreDataAccessService,
  ) {}

  getMcpBaseUrl(req?: { protocol: string; get: (name: string) => string | undefined }): string {
    if (req) {
      const proto = req.get('x-forwarded-proto') || req.protocol
      const host = req.get('x-forwarded-host') || req.get('host')
      return `${proto}://${host}/api/mcp`
    }
    // API_URL is the origin only (no `/api` suffix — see libs/api/config/src/lib/validation.ts),
    // so the `/api/mcp` prefix is appended directly. Trim any trailing slashes defensively (env
    // vars are often set with one) so we never produce `//api/mcp` — string ops avoid regex
    // backtracking.
    let apiUrl = this.config.get<string>('apiUrl') || 'http://localhost:3000'
    while (apiUrl.endsWith('/')) {
      apiUrl = apiUrl.slice(0, -1)
    }
    return `${apiUrl}/api/mcp`
  }

  registerClient(clientName: string, redirectUris: string[]): OAuthClient {
    const clientId = randomBytes(16).toString('hex')
    const client: OAuthClient = { clientId, clientName, redirectUris }
    this.clients.set(clientId, client)
    this.logger.log(`Registered MCP OAuth client: ${clientName} (${clientId})`)
    return client
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId)
  }

  createAuthCode(params: Omit<StoredAuthCode, 'expiresAt'>): string {
    const code = randomBytes(32).toString('hex')
    this.authCodes.set(code, {
      ...params,
      expiresAt: new Date(Date.now() + this.CODE_TTL_MS),
    })
    return code
  }

  consumeAuthCode(code: string): StoredAuthCode | null {
    const authCode = this.authCodes.get(code)
    if (!authCode) return null
    this.authCodes.delete(code)
    if (authCode.expiresAt < new Date()) {
      this.logger.warn('Auth code expired')
      return null
    }
    return authCode
  }

  verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
    if (method === 'S256') {
      const hash = createHash('sha256').update(codeVerifier).digest('base64url')
      return hash === codeChallenge
    }
    return codeVerifier === codeChallenge
  }

  async countUserOrganizations(userId: string): Promise<number> {
    return this.data.organizationMember.count({ where: { userId } })
  }

  async resolveOrganizationId(userId: string): Promise<string | null> {
    const membership = await this.data.organizationMember.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { organizationId: true },
    })
    return membership?.organizationId ?? null
  }

  async validateOrgMembership(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.data.organizationMember.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    })
    return !!membership
  }

  async createAccessToken(userId: string, organizationId: string | null): Promise<string> {
    const result = await this.apiTokensService.generateApiToken(userId, {
      name: `MCP (${new Date().toISOString()})`,
      organizationId: organizationId ?? undefined,
    })
    return result.token
  }
}
