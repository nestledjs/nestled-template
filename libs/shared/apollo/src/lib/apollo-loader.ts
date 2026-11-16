import { createApolloLoaderHandler } from '@apollo/client-integration-react-router'
import { isOrganizationContextRequiredError, makeClient, type ApiFailureCause } from './apollo'

/**
 * What the API answered when a loader's preloaded query failed during a server render.
 *
 * The streamed query ref redacts the error ("Error from event stream. Redacted for security
 * concerns."), so by the time the failure reaches `onShellError` in entry.server.tsx a rejected
 * session and an unreachable API look the same. The loader's own Apollo client still sees the real
 * error, so each `apolloLoader` call records it here, and attaches the record to the data the
 * loader returns (in a side table keyed by that data), where entry.server.tsx finds it again
 * (`ssrApiFailureCause`).
 */
interface SsrApiFailureRecord {
  cause?: ApiFailureCause
  /** A query was refused with `ORGANIZATION_CONTEXT_REQUIRED` (by code; nothing else is kept). */
  organizationRequired?: boolean
  /** Operations this loader's client started that have not settled yet. */
  pending: number
  /** Called each time `pending` returns to 0 (see `waitForSsrApiCalls`). */
  idle: Set<() => void>
}

// Loader data -> its request's record. A side table rather than a property on the data, so frozen
// or non-extensible loader data (`Object.freeze({...})`, a frozen constant) is never mutated, which
// would throw in strict mode. Registered on globalThis under a `Symbol.for` key so a second copy of
// this module (a separate server chunk) still finds the records the first one attached.
const RECORDS_KEY = Symbol.for('nestled.ssrApiFailureRecords')
const globalRecords = globalThis as { [RECORDS_KEY]?: WeakMap<object, SsrApiFailureRecord> }
const recordsByData = (globalRecords[RECORDS_KEY] ??= new WeakMap<object, SsrApiFailureRecord>())

// Outage evidence outranks a rejected session, which outranks an ordinary answered error. A 401
// alongside an unreachable API is not proof the session is bad (the API may have failed to look it
// up), so the request is treated as an outage and the session kept; only a 401 with no outage
// evidence anywhere in the request is a rejected session.
const CAUSE_RANK: Record<ApiFailureCause, number> = { other: 1, unauthenticated: 2, unavailable: 3 }

/**
 * Combines two API failure causes from the same request: `unavailable` wins over
 * `unauthenticated`, which wins over `other`; undefined (nothing seen) loses to any cause.
 */
export function mergeApiFailureCauses(
  a: ApiFailureCause | undefined,
  b: ApiFailureCause | undefined,
): ApiFailureCause | undefined {
  if (!a) return b
  if (!b) return a
  return CAUSE_RANK[b] > CAUSE_RANK[a] ? b : a
}

function recordFailure(record: SsrApiFailureRecord, cause: ApiFailureCause, error: unknown) {
  record.cause = mergeApiFailureCauses(record.cause, cause)
  if (isOrganizationContextRequiredError(error)) record.organizationRequired = true
}

function trackOperation(record: SsrApiFailureRecord): () => void {
  record.pending += 1
  return () => {
    record.pending -= 1
    if (record.pending === 0) for (const notify of record.idle) notify()
  }
}

// Keyed by the request the loader receives (React Router hands each loader its own copy).
const recordsByRequest = new WeakMap<Request, SsrApiFailureRecord>()

function recordFor(request: Request): SsrApiFailureRecord {
  let record = recordsByRequest.get(request)
  if (!record) {
    record = { pending: 0, idle: new Set() }
    recordsByRequest.set(request, record)
  }
  return record
}

function attachRecord<T>(data: T, record: SsrApiFailureRecord): T {
  // Plain loader data only: a redirect or other Response passes through untouched. The data itself
  // is never changed, so nothing is serialized to the browser or seen by code that reads it.
  if (data !== null && typeof data === 'object' && !(data instanceof Response)) {
    if (!recordsByData.has(data)) recordsByData.set(data, record)
  }
  return data
}

const handler = createApolloLoaderHandler(req =>
  makeClient(req, {
    apiUrl: `${process.env.VITE_API_URL || 'http://localhost:3000'}/graphql`,
    onApiFailure: (cause, error) => recordFailure(recordFor(req), cause, error),
    onOperationStart: () => trackOperation(recordFor(req)),
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
 * Apollo client saw a failure. When several failed, they combine as `mergeApiFailureCauses` does:
 * any outage makes the request `unavailable`, even alongside a 401.
 */
export function ssrApiFailureCause(
  loaderData: Record<string, unknown> | null | undefined,
): ApiFailureCause | undefined {
  let cause: ApiFailureCause | undefined
  for (const record of recordsOf(loaderData)) cause = mergeApiFailureCauses(cause, record.cause)
  return cause
}

function recordsOf(loaderData: Record<string, unknown> | null | undefined): SsrApiFailureRecord[] {
  const records: SsrApiFailureRecord[] = []
  for (const data of Object.values(loaderData ?? {})) {
    const record = data !== null && typeof data === 'object' ? recordsByData.get(data) : undefined
    if (record) records.push(record)
  }
  return records
}

/**
 * Whether a loader's preloaded query was refused with `ORGANIZATION_CONTEXT_REQUIRED` during this
 * server render (from the loader data in the router context, as `ssrApiFailureCause`). The refusal
 * reaches the render as Apollo's redacted stream error, which has lost the code.
 */
export function ssrOrganizationRequired(
  loaderData: Record<string, unknown> | null | undefined,
): boolean {
  return recordsOf(loaderData).some(record => record.organizationRequired)
}

/**
 * Waits until every API call the request's loaders started through `apolloLoader` has settled, so
 * its failure, if any, is in `ssrApiFailureCause`. A loader returns its preloaded query refs
 * without awaiting them (the root loader's Me among them), so a faster call can fail first:
 * deciding a sign-out on its 401 then would miss a slower call's 503. Resolves true once all have
 * settled (at once when none is in flight), false when `timeoutMs` passes first, which is no proof
 * the session is bad: the caller then keeps it.
 */
export function waitForSsrApiCalls(
  loaderData: Record<string, unknown> | null | undefined,
  timeoutMs: number,
): Promise<boolean> {
  const records = recordsOf(loaderData).filter(record => record.pending > 0)
  if (records.length === 0) return Promise.resolve(true)
  return new Promise(resolve => {
    const finish = (settled: boolean) => {
      clearTimeout(timer)
      for (const record of records) record.idle.delete(check)
      resolve(settled)
    }
    const check = () => {
      if (records.every(record => record.pending === 0)) finish(true)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    for (const record of records) record.idle.add(check)
  })
}
