import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { organizationContextRequired } from '../errors/api-error-code'
import { OrganizationContext } from '../types/nest-context-type'

type RequestWithOrganizationContext = { organizationContext?: OrganizationContext }

/**
 * The request from the GraphQL context. A context without one (a subscription connection that
 * never got a request, or a decorator used outside GraphQL) is a server bug: a 500, never a 401,
 * which would log the user out, and never a 403, which would blame the user's organization.
 */
function requestFrom(ctx: ExecutionContext): RequestWithOrganizationContext {
  const req = GqlExecutionContext.create(ctx).getContext()?.req as
    RequestWithOrganizationContext | undefined
  if (!req) {
    throw new InternalServerErrorException(
      'Organization context cannot be read: the GraphQL context has no request.',
    )
  }
  return req
}

/**
 * Extract organization context from GraphQL request
 * Throws a 403 `ORGANIZATION_CONTEXT_REQUIRED` if no organization context is found (no active
 * organization, or one the user no longer belongs to). Never a 401: the session is fine, and a 401
 * would log the user out. A context with no request at all is a 500 (see `requestFrom`).
 */
export const CtxOrganization = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): OrganizationContext => {
    const organizationContext = requestFrom(ctx).organizationContext

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
 * would log the user out. A context with no request at all is a 500 (see `requestFrom`).
 */
export const CtxOrganizationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const organizationContext = requestFrom(ctx).organizationContext

    if (!organizationContext) {
      throw organizationContextRequired()
    }

    return organizationContext.organizationId
  },
)

/**
 * The organization id from the request's membership-checked context, or null when there is none
 * (no active organization, or one the user is no longer a member of). For reads that answer "nothing"
 * rather than refuse in that case. A context with no request at all is a 500 (see `requestFrom`).
 */
export const CtxOptionalOrganizationId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    return requestFrom(ctx).organizationContext?.organizationId ?? null
  },
)
