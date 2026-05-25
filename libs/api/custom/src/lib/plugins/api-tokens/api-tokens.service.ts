import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { SecurityEventsService } from '../security/security-events.service'
import { randomBytes, createHash } from 'node:crypto'
import { GenerateApiTokenInput, RotateApiTokenInput, GenerateApiTokenOutput } from './dto'
import { ApiToken } from '@nestled-template/api/core/models'

@Injectable()
export class ApiTokensService {
  private readonly logger = new Logger(ApiTokensService.name)

  constructor(
    private readonly data: ApiCoreDataAccessService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  /**
   * Generate a cryptographically secure API token
   */
  async generateApiToken(
    userId: string,
    input: GenerateApiTokenInput,
  ): Promise<GenerateApiTokenOutput> {
    const organizationId = input.organizationId?.trim() || undefined

    // Generate a secure random token (32 bytes = 64 hex characters)
    const tokenValue = randomBytes(32).toString('hex')

    // Hash the token for storage (we only store the hash)
    const tokenHash = this.hashToken(tokenValue)

    if (organizationId) {
      await this.assertOrganizationMembership(userId, organizationId)
    }

    // Create the API token record
    const apiToken = await this.data.apiToken.create({
      data: {
        name: input.name,
        tokenHash,
        userId,
        expiresAt: input.expiresAt,
        organizationId,
        lastUsedAt: null,
        revoked: false,
      },
    })

    // Log security event
    await this.securityEvents.logEvent(userId, 'API_TOKEN_CREATED', {
      metadata: {
        tokenId: apiToken.id,
        tokenName: input.name,
        organizationId: organizationId ?? null,
      },
    })

    this.logger.log(`API token generated for user ${userId}: ${input.name}`)

    // Return the plaintext token (only shown once!) and the token record
    return {
      token: tokenValue,
      apiToken,
    }
  }

  /**
   * List all API tokens for a user (without token values)
   */
  async listApiTokens(userId: string): Promise<ApiToken[]> {
    return this.data.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Revoke an API token
   */
  async revokeApiToken(userId: string, tokenId: string): Promise<ApiToken> {
    // Verify the token belongs to the user
    const token = await this.data.apiToken.findUnique({
      where: { id: tokenId },
    })

    if (token?.userId !== userId) {
      throw new BadRequestException('API token not found')
    }

    if (token.revoked) {
      throw new BadRequestException('API token is already revoked')
    }

    // Revoke the token
    const revokedToken = await this.data.apiToken.update({
      where: { id: tokenId },
      data: { revoked: true },
    })

    // Log security event
    await this.securityEvents.logEvent(userId, 'API_TOKEN_REVOKED', {
      metadata: { tokenId, tokenName: token.name },
    })

    this.logger.log(`API token revoked for user ${userId}: ${token.name}`)

    return revokedToken
  }

  /**
   * Rotate an API token (generate new token, optionally keep old one active)
   */
  async rotateApiToken(
    userId: string,
    input: RotateApiTokenInput,
  ): Promise<GenerateApiTokenOutput> {
    // Get the existing token
    const oldToken = await this.data.apiToken.findUnique({
      where: { id: input.tokenId },
    })

    if (oldToken?.userId !== userId) {
      throw new BadRequestException('API token not found')
    }

    // Generate new token with same name
    const newTokenValue = randomBytes(32).toString('hex')
    const newTokenHash = this.hashToken(newTokenValue)

    // Create new token record
    const newApiToken = await this.data.apiToken.create({
      data: {
        name: oldToken.name,
        tokenHash: newTokenHash,
        userId,
        expiresAt: oldToken.expiresAt,
        organizationId: oldToken.organizationId ?? undefined,
        lastUsedAt: null,
        revoked: false,
      },
    })

    // Revoke old token unless keepOldTokenActive is true
    if (!input.keepOldTokenActive) {
      await this.data.apiToken.update({
        where: { id: input.tokenId },
        data: { revoked: true },
      })
    }

    // Log security event
    await this.securityEvents.logEvent(userId, 'API_TOKEN_ROTATED', {
      metadata: {
        oldTokenId: input.tokenId,
        newTokenId: newApiToken.id,
        tokenName: oldToken.name,
        organizationId: oldToken.organizationId ?? null,
        keepOldTokenActive: input.keepOldTokenActive,
      },
    })

    this.logger.log(`API token rotated for user ${userId}: ${oldToken.name}`)

    return {
      token: newTokenValue,
      apiToken: newApiToken,
    }
  }

  /**
   * Validate an API token and return the associated user
   */
  async validateApiToken(
    token: string,
  ): Promise<{ userId: string; tokenId: string; organizationId: string | null } | null> {
    const tokenHash = this.hashToken(token)

    // Find token by hash
    const apiToken = await this.data.apiToken.findFirst({
      where: {
        tokenHash,
        revoked: false,
      },
    })

    if (!apiToken) {
      return null
    }

    // Check expiration
    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
      this.logger.warn(`Expired API token used: ${apiToken.id}`)
      return null
    }

    // Update last used timestamp (async, don't block)
    setImmediate(async () => {
      try {
        await this.data.apiToken.update({
          where: { id: apiToken.id },
          data: { lastUsedAt: new Date() },
        })
      } catch (error) {
        this.logger.error(`Failed to update lastUsedAt for token ${apiToken.id}`, error)
      }
    })

    return {
      userId: apiToken.userId,
      tokenId: apiToken.id,
      organizationId: apiToken.organizationId ?? null,
    }
  }

  /**
   * Hash a token using SHA-256
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private async assertOrganizationMembership(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.data.organizationMember.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    })

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization')
    }
  }
}
