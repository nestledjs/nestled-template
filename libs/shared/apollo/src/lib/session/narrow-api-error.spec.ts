import { CombinedGraphQLErrors } from '@apollo/client'
import { isRouteErrorResponse } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ORGANIZATION_CONTEXT_REQUIRED_CODE } from '../apollo'
import { API_UNAUTHENTICATED_CODE, API_UNAVAILABLE_CODE, narrowApiError } from './narrow-api-error'

type Extensions = { code?: string; status?: number }

function graphQLErrors(...extensions: Extensions[]) {
  return new CombinedGraphQLErrors({
    errors: extensions.map(ext => ({ message: 'Something failed', extensions: ext })),
  })
}

const orgRequired: Extensions = { code: ORGANIZATION_CONTEXT_REQUIRED_CODE, status: 403 }
const unauthenticated: Extensions = { code: 'UNAUTHENTICATED', status: 401 }
const unavailable: Extensions = { code: 'SERVICE_UNAVAILABLE', status: 503 }

/** The status and code of the route error response `narrowApiError` made, if it made one. */
function narrowed(error: unknown): { status: number; code: unknown } | undefined {
  const result = narrowApiError(error) as {
    type?: string
    init?: { status?: number }
    data?: unknown
  }
  // `data(...)` returns a DataWithResponseInit: its init carries the status, its data the code.
  if (result && result.type === 'DataWithResponseInit') {
    return {
      status: result.init?.status ?? 200,
      code: (result.data as { code?: unknown } | undefined)?.code,
    }
  }
  if (isRouteErrorResponse(result)) {
    return { status: result.status, code: (result.data as { code?: unknown } | null)?.code }
  }
  return undefined
}

describe('narrowApiError precedence: outage, then authentication, then organization', () => {
  it('an organization-required error alone is the organization 403', () => {
    expect(narrowed(graphQLErrors(orgRequired))).toEqual({
      status: 403,
      code: ORGANIZATION_CONTEXT_REQUIRED_CODE,
    })
  })

  it('organization-required beside a GraphQL 503 is the outage', () => {
    expect(narrowed(graphQLErrors(orgRequired, unavailable))).toEqual({
      status: 503,
      code: API_UNAVAILABLE_CODE,
    })
  })

  it('organization-required beside UNAUTHENTICATED asks for a fresh session verdict', () => {
    expect(narrowed(graphQLErrors(orgRequired, unauthenticated))).toEqual({
      status: 401,
      code: API_UNAUTHENTICATED_CODE,
    })
  })

  it('all three together is the outage: outage evidence outranks a 401', () => {
    expect(narrowed(graphQLErrors(unauthenticated, orgRequired, unavailable))).toEqual({
      status: 503,
      code: API_UNAVAILABLE_CODE,
    })
  })

  it('passes any other error through unchanged', () => {
    const error = graphQLErrors({ code: 'BAD_USER_INPUT', status: 400 })
    expect(narrowApiError(error)).toBe(error)
  })
})
