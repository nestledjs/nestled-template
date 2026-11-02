import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { ApiTokensService } from '../plugins/api-tokens/api-tokens.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { isSameResource, requestMcpResource } from '../plugins/mcp/mcp-resource'

type ApiTokenRequest = Request & {
  user?: unknown
  apiTokenId?: string
  apiTokenOrganizationId?: string | null
}

type ValidatedApiToken = NonNullable<Awaited<ReturnType<ApiTokensService['validateApiToken']>>>

@Injectable()
export class ApiTokenAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiTokenAuthMiddleware.name)

  constructor(
    private readonly apiTokensService: ApiTokensService,
    private readonly data: ApiCoreDataAccessService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Check for Authorization header with Bearer token
    const authHeader = req.headers['authorization'] as string | undefined

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)

      if (!/^[a-f0-9]{64}$/i.test(token)) {
        return next()
      }

      try {
        // Validate the token
        const result = await this.apiTokensService.validateApiToken(token)

        // A token bound to a resource (RFC 8707) must name the MCP endpoint this request reached.
        // Unbound tokens (created in settings, or issued by MCP OAuth before binding) still work.
        if (result?.resource && !isSameResource(result.resource, requestMcpResource(req))) {
          this.logger.warn(
            `API token ${result.tokenId} is bound to ${result.resource}; refused here`,
          )
          return next()
        }

        if (result) {
          await this.attachTokenUser(req, result)
        } else {
          this.logger.warn('Invalid or expired API token provided')
        }
      } catch (error) {
        this.logger.error('Error validating API token', error)
      }
    }

    // Continue to next middleware/handler
    next()
  }

  /**
   * Load the token's user and attach it to the request. A missing or deactivated user is refused
   * (logged, nothing attached) and the token does not count as used.
   */
  private async attachTokenUser(req: Request, result: ValidatedApiToken): Promise<void> {
    // Load the user and attach to request
    const user = await this.data.user.findUnique({
      where: { id: result.userId },
      include: {
        organizations: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
            organization: true,
          },
        },
      },
    })

    if (!user) {
      this.logger.warn(`User not found for valid API token: ${result.userId}`)
    } else if (user.isActive === false) {
      // The same rule JwtStrategy applies to sessions and API tokens: a deactivated account
      // is refused, and its token does not count as used.
      this.logger.warn(`API token ${result.tokenId} belongs to a deactivated user; refused`)
    } else {
      const apiTokenReq = req as ApiTokenRequest
      apiTokenReq.user = user
      apiTokenReq.apiTokenId = result.tokenId
      apiTokenReq.apiTokenOrganizationId = result.organizationId
      this.apiTokensService.recordTokenUse(result.tokenId)

      this.logger.log(`API token authentication successful for user ${user.id}`)
    }
  }
}
