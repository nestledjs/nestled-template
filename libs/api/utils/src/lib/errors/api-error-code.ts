import { ForbiddenException } from '@nestjs/common'
import type { GraphQLFormattedError } from 'graphql'

/**
 * GraphQL error codes the API sets on its own, beyond the ones `@nestjs/apollo` derives from an
 * HTTP status (`UNAUTHENTICATED` for 401, `FORBIDDEN` for 403, `BAD_REQUEST` for 400, ...).
 *
 * Clients log a user out only on a 401 or `UNAUTHENTICATED`, so anything that is not "this session
 * is missing, invalid or expired" must never be an `UnauthorizedException`. A refusal that a client
 * should handle on its own terms (pick an organization, retry the provider sign-in) is a 403 with
 * one of these codes instead. The web keeps the session for every one of them.
 */
export const API_ERROR_CODES = {
  /** Signed in, but the request has no active organization, or one the user no longer belongs to. */
  ORGANIZATION_CONTEXT_REQUIRED: 'ORGANIZATION_CONTEXT_REQUIRED',
  /** The OAuth provider rejected the token or code it was given. Says nothing about the session. */
  OAUTH_PROVIDER_REJECTED: 'OAUTH_PROVIDER_REJECTED',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

const ORGANIZATION_CONTEXT_REQUIRED_MESSAGE =
  'Organization context required. Please set X-Organization-ID header or ensure user has an active organization.'

// Upper snake case, like the codes Apollo and Nest use.
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/

/**
 * A 403 whose GraphQL error carries `extensions.code: code` (see `formatApiError`). Over REST it is
 * an ordinary 403 whose JSON body also has `code`. `code` need not be one of `API_ERROR_CODES`:
 * apps throw their own (a workflow state, a plan limit, ...) and `formatApiError` keeps any of
 * them, as long as it is upper snake case and not `UNAUTHENTICATED`.
 */
export function forbiddenWithCode(code: string, message: string): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, error: 'Forbidden', message, code })
}

/** The request has no organization context: a 403 `ORGANIZATION_CONTEXT_REQUIRED`, never a 401. */
export function organizationContextRequired(
  message: string = ORGANIZATION_CONTEXT_REQUIRED_MESSAGE,
): ForbiddenException {
  return forbiddenWithCode(API_ERROR_CODES.ORGANIZATION_CONTEXT_REQUIRED, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The GraphQL `formatError`. `@nestjs/apollo` runs first and replaces the code of every HTTP
 * exception with the one for its status, keeping the exception's body as
 * `extensions.originalError`. This puts back the code `forbiddenWithCode` gave the body: any
 * upper-snake-case code, the app's own as well as `API_ERROR_CODES`, so an app's clients see the
 * codes it throws. It never sets a code on a 401, and never sets `UNAUTHENTICATED`: only a real
 * 401 may tell a client the session is dead. An internal failure (a 500 or 503) keeps Nest's
 * `INTERNAL_SERVER_ERROR` and `extensions.status`.
 */
export function formatApiError(formattedError: GraphQLFormattedError): GraphQLFormattedError {
  const originalError = formattedError.extensions?.['originalError']
  if (!isRecord(originalError)) return formattedError

  const { code, statusCode } = originalError
  if (typeof code !== 'string' || !ERROR_CODE_PATTERN.test(code)) return formattedError
  if (statusCode === 401 || code === 'UNAUTHENTICATED') return formattedError

  return { ...formattedError, extensions: { ...formattedError.extensions, code } }
}
