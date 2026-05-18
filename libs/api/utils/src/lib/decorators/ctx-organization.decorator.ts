import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { OrganizationContext } from '../types/nest-context-type'

/**
 * Extract organization context from GraphQL request
 * Throws UnauthorizedException if no organization context is found
 */
export const CtxOrganization = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): OrganizationContext => {
    const gqlContext = GqlExecutionContext.create(ctx).getContext()
    const organizationContext = gqlContext.req.organizationContext

    if (!organizationContext) {
      throw new UnauthorizedException(
        'Organization context required. Please set X-Organization-ID header or ensure user has an active organization.',
      )
    }

    return organizationContext
  },
)

/**
 * Extract organization ID from context
 * Throws UnauthorizedException if no organization context is found
 */
export const CtxOrganizationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const gqlContext = GqlExecutionContext.create(ctx).getContext()
    const organizationContext = gqlContext.req.organizationContext

    if (!organizationContext) {
      throw new UnauthorizedException(
        'Organization context required. Please set X-Organization-ID header or ensure user has an active organization.',
      )
    }

    return organizationContext.organizationId
  },
)
