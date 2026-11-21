import { classifyApiFailure } from '../apollo'
import {
  OUTAGE_MEMORY_MS,
  type MeOutcome,
  type SessionEvidence,
  type SessionVerdict,
} from './session-verdict'

/**
 * The one rule that turns evidence about a request's session into a verdict. Nothing else in the
 * codebase may decide that a session is signed out (the session audit,
 * scripts/audit-session-decisions.mjs, enforces it).
 *
 * Owner rule: sign out only on an unambiguous 401 with no outage evidence. Outage always outranks a
 * 401. The error message is never read.
 *
 * In order, first match wins:
 * 1. no cookie, or a JWT whose `exp` has passed: `signed-out/no-session`.
 * 2. Me timed out: `unknown/timeout`; Me found the API unreachable: `unknown/outage`.
 * 3. Me answered the user: `signed-in`.
 * 4. Me answered a clean 401 (`unauthenticated`):
 *    - this instance saw an outage within `OUTAGE_MEMORY_MS`: `unknown/outage`;
 *    - no confirmation, or it timed out or found the API unreachable: `unknown/outage`;
 *    - the confirmation answered the user: `signed-in` (the 401 was transient);
 *    - the confirmation answered a clean 401 too: `signed-out/rejected`;
 *    - anything else: `unknown/answered-error`.
 * 5. Me answered another error: `unknown/answered-error`; Me answered null: `unknown/empty`.
 */
export function judgeSession<User>(evidence: SessionEvidence<User>): SessionVerdict<User> {
  if (evidence.cookie !== 'present') return { kind: 'signed-out', reason: 'no-session' }

  const { me } = evidence
  if (!me || me.kind === 'timeout') return { kind: 'unknown', reason: me ? 'timeout' : 'outage' }
  if (me.kind === 'user') return { kind: 'signed-in', user: me.user }
  if (me.kind === 'null') return { kind: 'unknown', reason: 'empty' }
  if (me.cause === 'unavailable') return { kind: 'unknown', reason: 'outage' }
  if (me.cause === 'other') return { kind: 'unknown', reason: 'answered-error' }
  return judgeCleanUnauthenticated(evidence)
}

/**
 * Step 4 of `judgeSession`: Me answered a clean 401. Trusted only when nothing points to an outage
 * and a second call agrees.
 */
function judgeCleanUnauthenticated<User>(evidence: SessionEvidence<User>): SessionVerdict<User> {
  const { outageSeenMsAgo, confirm } = evidence
  if (outageSeenMsAgo !== undefined && outageSeenMsAgo < OUTAGE_MEMORY_MS) {
    return { kind: 'unknown', reason: 'outage' }
  }
  if (!confirm || confirm.kind === 'timeout') return { kind: 'unknown', reason: 'outage' }
  if (confirm.kind === 'user') return { kind: 'signed-in', user: confirm.user }
  if (confirm.kind === 'error' && confirm.cause === 'unavailable') {
    return { kind: 'unknown', reason: 'outage' }
  }
  if (confirm.kind === 'error' && confirm.cause === 'unauthenticated') {
    return { kind: 'signed-out', reason: 'rejected' }
  }
  return { kind: 'unknown', reason: 'answered-error' }
}

/**
 * A Me call's result as the judge sees it. The error is read before the data: under
 * `errorPolicy: 'all'` a rejected session comes back as `data.me === null` beside the error, and
 * reading the data first called that "empty" (spike 3 of the sign-out design).
 */
export function meOutcomeFromResult<User>(result: {
  data?: { me?: User | null } | null
  error?: unknown
}): MeOutcome<User> {
  if (result.error !== undefined && result.error !== null) return meOutcomeFromError(result.error)
  const user = result.data?.me
  return user ? { kind: 'user', user } : { kind: 'null' }
}

/** A Me call that threw, by `classifyApiFailure` (status and code only). */
export function meOutcomeFromError(error: unknown): MeOutcome<never> {
  return { kind: 'error', cause: classifyApiFailure(error) }
}

/** Whether a Me outcome is the clean 401 that calls for the one-shot confirmation. */
export function needsConfirmation(outcome: MeOutcome<unknown>): boolean {
  return outcome.kind === 'error' && outcome.cause === 'unauthenticated'
}
