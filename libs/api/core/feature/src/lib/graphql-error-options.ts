import { formatApiError } from '@nestled-template/api/utils'

/**
 * Whether GraphQL error responses carry `extensions.stacktrace`. Only when
 * `GRAPHQL_INCLUDE_STACKTRACE=true` AND `NODE_ENV=development`: a local opt-in for debugging.
 *
 * Apollo's own default includes stack traces unless NODE_ENV is `production` or `test`, so a
 * deployed environment with any other NODE_ENV (`stage`, `staging`, `preview`, ...) sent server
 * file paths and code to every client. The variable is ignored on any deployed environment, since
 * none runs with NODE_ENV=development.
 */
export function includeGraphqlStacktrace(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['GRAPHQL_INCLUDE_STACKTRACE'] === 'true' && env['NODE_ENV'] === 'development'
}

/** The error handling options of the API's GraphQL server. */
export function graphqlErrorOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    // Always set: left out, Apollo decides from NODE_ENV (see includeGraphqlStacktrace).
    includeStacktraceInErrorResponses: includeGraphqlStacktrace(env),
    // Keeps the code a 403 was thrown with (`forbiddenWithCode`), so a client can tell "pick an
    // organization" from "no permission". Nest's own HTTP-status mapping runs before it.
    formatError: formatApiError,
  }
}
