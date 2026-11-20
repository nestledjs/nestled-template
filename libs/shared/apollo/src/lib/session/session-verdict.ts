import type { ApiFailureCause } from '../apollo'

/**
 * What the server decided about a request's session, once, before any loader ran
 * (apps/web/app/session/session-middleware.server.ts). Loaders and components read it; nothing
 * else in the app may decide a session.
 *
 * - `signed-in`: the API answered Me with the user.
 * - `signed-out`:
 *   - `rejected`: the API rejected the session twice, cleanly (HTTP 401 or `UNAUTHENTICATED`), with
 *     no outage evidence anywhere. The only verdict that ends a session.
 *   - `no-session`: no session cookie, or one whose JWT `exp` has passed (no API call made).
 * - `unknown`: anything else. The session is kept and the request is retried later.
 *   - `outage`: no answer, a 502/503/504, a GraphQL 503, or a 401 alongside outage evidence.
 *   - `timeout`: Me did not answer within `SESSION_TIMEOUT_MS`.
 *   - `answered-error`: the API answered with some other error (a 500, a validation error).
 *   - `empty`: the API answered `me: null` with no error.
 */
export type SessionVerdict<User = unknown> =
  | { kind: 'signed-in'; user: User }
  | { kind: 'signed-out'; reason: 'rejected' | 'no-session' }
  | { kind: 'unknown'; reason: 'outage' | 'timeout' | 'answered-error' | 'empty' }

/** One Me call's outcome, by code and status only. The error message is never read. */
export type MeOutcome<User = unknown> =
  | { kind: 'user'; user: User }
  /** `data.me === null` and no error at all. */
  | { kind: 'null' }
  | { kind: 'error'; cause: ApiFailureCause }
  | { kind: 'timeout' }

/** Everything the judge is allowed to look at. */
export interface SessionEvidence<User = unknown> {
  /** `expired`: the cookie's JWT `exp` has passed, so no API call was made. */
  cookie: 'absent' | 'expired' | 'present'
  /** The first Me call. */
  me?: MeOutcome<User>
  /** The one-shot confirmation Me call, made only after the first one answered a clean 401. */
  confirm?: MeOutcome<User>
  /** How long ago any request on this web instance saw the API unreachable (`outage-memory`). */
  outageSeenMsAgo?: number
}

/**
 * How long the session middleware waits for each Me call before judging the session `unknown`
 * (the value the server render already allowed its API calls to settle).
 */
export const SESSION_TIMEOUT_MS = 3_000

/**
 * How long an API outage seen by any request on this web instance keeps a 401 untrusted (owner
 * decision D1, 2026.11.10). Longer keeps sessions more safely through an outage; shorter signs a
 * truly dead session out sooner after one. A dead session is signed out on the first request after
 * this window.
 */
export const OUTAGE_MEMORY_MS = 30_000

/**
 * The browser asks the server to judge the session again (a revalidation) at most this often,
 * however many 401s it sees.
 */
export const SESSION_REVALIDATE_COOLDOWN_MS = 5_000
