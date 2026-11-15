import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { organizationContextRequired } from '../errors/api-error-code'
import { OrganizationContext } from '../types/nest-context-type'

/**
 * Extract organization context from GraphQL request
 * Throws a 403 `ORGANIZATION_CONTEXT_REQUIRED` if no organization context is found (no active
 * organization, or one the user no longer belongs to). Never a 401: the session is fine, and a 401
 * would log the user out.
 */
export const CtxOrganization = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): OrganizationContext => {
    const gqlContext = GqlExecutionContext.create(ctx).getContext()
    const organizationContext = gqlContext.req.organizationContext

    if (!organizationContext) {
      throw organizationContextRequired()
    }

    return organizationContext
  },
)

/**
 * Extract organization ID from context
 * Throws a 403 `ORGANIZATION_CONTEXT_REQUIRED` if no organization context is found (no active
 * organization, or one the user no longer belongs to). Never a 401: the session is fine, and a 401
 * would log the user out.
 */
export const CtxOrganizationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const gqlContext = GqlExecutionContext.create(ctx).getContext()
    const organizationContext = gqlContext.req.organizationContext

    if (!organizationContext) {
      throw organizationContextRequired()
    }

    return organizationContext.organizationId
  },
)

/**
 * The organization id from the request's membership-checked context, or null when there is none
 * (no active organization, or one the user is no longer a member of). For reads that answer "nothing"
 * rather than refuse in that case.
 */
export const CtxOptionalOrganizationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const gqlContext = GqlExecutionContext.create(ctx).getContext()
    return gqlContext.req.organizationContext?.organizationId ?? null
  },
)
