import { createApolloLoaderHandler } from '@apollo/client-integration-react-router'
import { makeClient, type ApiFailureCause } from './apollo'

/**
 * What the API answered when a loader's preloaded query failed during a server render.
 *
 * The streamed query ref redacts the error ("Error from event stream. Redacted for security
 * concerns."), so by the time the failure reaches `onShellError` in entry.server.tsx a rejected
 * session and an unreachable API look the same. The loader's own Apollo client still sees the real
 * error, so each `apolloLoader` call records it here, and attaches the record to the data the
 * loader returns, where entry.server.tsx finds it again (`ssrApiFailureCause`).
 */
interface SsrApiFailureRecord {
  cause?: ApiFailureCause
}

const SSR_API_FAILURE = Symbol.for('nestled.ssrApiFailure')

// The most decisive cause wins: one rejected session means the session is rejected, whatever else
// failed alongside it; an unreachable API outranks an ordinary answered error.
const CAUSE_RANK: Record<ApiFailureCause, number> = { other: 1, unavailable: 2, unauthenticated: 3 }

function strongest(
  a: ApiFailureCause | undefined,
  b: ApiFailureCause | undefined,
): ApiFailureCause | undefined {
  if (!a) return b
  if (!b) return a
  return CAUSE_RANK[b] > CAUSE_RANK[a] ? b : a
}

function recordFailure(record: SsrApiFailureRecord, cause: ApiFailureCause) {
  record.cause = strongest(record.cause, cause)
}

// Keyed by the request the loader receives (React Router hands each loader its own copy).
const recordsByRequest = new WeakMap<Request, SsrApiFailureRecord>()

function recordFor(request: Request): SsrApiFailureRecord {
  let record = recordsByRequest.get(request)
  if (!record) {
    record = {}
    recordsByRequest.set(request, record)
  }
  return record
}

function attachRecord<T>(data: T, record: SsrApiFailureRecord): T {
  // Plain loader data only: a redirect or other Response passes through untouched. Not enumerable,
  // and a symbol, so it is never serialized to the browser or seen by code that reads the data.
  if (data !== null && typeof data === 'object' && !(data instanceof Response)) {
    if (!Object.prototype.hasOwnProperty.call(data, SSR_API_FAILURE)) {
      Object.defineProperty(data, SSR_API_FAILURE, { value: record, enumerable: false })
    }
  }
  return data
}

const handler = createApolloLoaderHandler(req =>
  makeClient(req, {
    apiUrl: `${process.env.VITE_API_URL || 'http://localhost:3000'}/graphql`,
    onApiFailure: cause => recordFailure(recordFor(req), cause),
  }),
)

export const apolloLoader: typeof handler = () => loader => args => {
  const record = recordFor(args.request)
  const result = handler()(loader)(args)
  if (result instanceof Promise) {
    return result.then(data => attachRecord(data, record)) as typeof result
  }
  return attachRecord(result, record)
}

/**
 * The real cause of a failed preload during this server render, from the loader data in the
 * router context (`routerContext.staticHandlerContext.loaderData`), or undefined when no loader's
 * Apollo client saw a failure. When several failed, the most decisive cause wins.
 */
export function ssrApiFailureCause(
  loaderData: Record<string, unknown> | null | undefined,
): ApiFailureCause | undefined {
  let cause: ApiFailureCause | undefined
  for (const data of Object.values(loaderData ?? {})) {
    if (data !== null && typeof data === 'object') {
      const record = (data as { [SSR_API_FAILURE]?: SsrApiFailureRecord })[SSR_API_FAILURE]
      cause = strongest(cause, record?.cause)
    }
  }
  return cause
}
