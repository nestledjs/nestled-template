import { describe, expect, it } from 'vitest'
import { CombinedGraphQLErrors, ServerError } from '@apollo/client'
import { judgeSession, meOutcomeFromError, meOutcomeFromResult } from './judge-session'
import {
  OUTAGE_MEMORY_MS,
  type MeOutcome,
  type SessionEvidence,
  type SessionVerdict,
} from './session-verdict'

type User = { id: string }
const ADA: User = { id: 'ada' }

const user: MeOutcome<User> = { kind: 'user', user: ADA }
const empty: MeOutcome<User> = { kind: 'null' }
const timeout: MeOutcome<User> = { kind: 'timeout' }
const unauthenticated: MeOutcome<User> = { kind: 'error', cause: 'unauthenticated' }
const unavailable: MeOutcome<User> = { kind: 'error', cause: 'unavailable' }
const other: MeOutcome<User> = { kind: 'error', cause: 'other' }

const signedIn: SessionVerdict<User> = { kind: 'signed-in', user: ADA }
const rejected: SessionVerdict<User> = { kind: 'signed-out', reason: 'rejected' }
const noSession: SessionVerdict<User> = { kind: 'signed-out', reason: 'no-session' }
const unknown = (reason: 'outage' | 'timeout' | 'answered-error' | 'empty') =>
  ({ kind: 'unknown', reason }) as const

function serverError(status: number): ServerError {
  return new ServerError('Response not successful', {
    response: new Response(null, { status }),
    bodyText: '',
  })
}

function graphQLError(code: string, message = 'Something failed', status?: number) {
  return new CombinedGraphQLErrors({
    errors: [{ message, extensions: { code, ...(status === undefined ? {} : { status }) } }],
  })
}

// One row per rule of the design's section 4.2 and per line of its section 5 case table.
const TABLE: Array<[string, SessionEvidence<User>, SessionVerdict<User>]> = [
  // Rule 1 / "no cookie / JWT exp passed"
  ['no cookie', { cookie: 'absent' }, noSession],
  ['a JWT whose exp has passed (no call made)', { cookie: 'expired' }, noSession],
  [
    'an expired cookie even if a Me outcome is somehow present',
    { cookie: 'expired', me: user },
    noSession,
  ],
  // Rule 2 / "Me no answer / 502-504 / GraphQL 503", "Me exceeds 3 s"
  ['Me timed out', { cookie: 'present', me: timeout }, unknown('timeout')],
  ['Me found the API unreachable', { cookie: 'present', me: unavailable }, unknown('outage')],
  ['a cookie but no Me call at all', { cookie: 'present' }, unknown('outage')],
  // Rule 3 / "Me answers the user"
  ['Me answered the user', { cookie: 'present', me: user }, signedIn],
  [
    'Me answered the user, an outage was seen 1 s ago (outage never outranks a user)',
    { cookie: 'present', me: user, outageSeenMsAgo: 1_000 },
    signedIn,
  ],
  // Rule 4 / "Me 401, confirm 401, no outage in OUTAGE_MEMORY_MS"
  [
    'Me 401, confirm 401, no outage ever seen',
    { cookie: 'present', me: unauthenticated, confirm: unauthenticated },
    rejected,
  ],
  [
    'Me 401, confirm 401, outage seen long ago',
    { cookie: 'present', me: unauthenticated, confirm: unauthenticated, outageSeenMsAgo: 600_000 },
    rejected,
  ],
  // "Me 401, but this instance saw an outage 10 s ago"
  [
    'Me 401, confirm 401, outage seen 10 s ago',
    { cookie: 'present', me: unauthenticated, confirm: unauthenticated, outageSeenMsAgo: 10_000 },
    unknown('outage'),
  ],
  // "Me 401, confirm 503 / no answer / timeout"
  ['Me 401, no confirmation', { cookie: 'present', me: unauthenticated }, unknown('outage')],
  [
    'Me 401, confirm timed out',
    { cookie: 'present', me: unauthenticated, confirm: timeout },
    unknown('outage'),
  ],
  [
    'Me 401, confirm found the API unreachable',
    { cookie: 'present', me: unauthenticated, confirm: unavailable },
    unknown('outage'),
  ],
  // "Me 401, confirm answers the user"
  [
    'Me 401, confirm answered the user (a transient 401)',
    { cookie: 'present', me: unauthenticated, confirm: user },
    signedIn,
  ],
  [
    'Me 401, confirm answered another error',
    { cookie: 'present', me: unauthenticated, confirm: other },
    unknown('answered-error'),
  ],
  [
    'Me 401, confirm answered null',
    { cookie: 'present', me: unauthenticated, confirm: empty },
    unknown('answered-error'),
  ],
  // Rule 5 / "Me 500 / other GraphQL error", "Me null, no error"
  ['Me answered another error', { cookie: 'present', me: other }, unknown('answered-error')],
  ['Me answered null with no error', { cookie: 'present', me: empty }, unknown('empty')],
]

describe('judgeSession', () => {
  it.each(TABLE)('%s', (_label, evidence, verdict) => {
    expect(judgeSession(evidence)).toEqual(verdict)
  })

  it('signs out only on a confirmed clean 401 with no recent outage, in every combination', () => {
    const outcomes = [undefined, user, empty, timeout, unauthenticated, unavailable, other]
    const outages = [undefined, 0, OUTAGE_MEMORY_MS - 1, OUTAGE_MEMORY_MS, 10 * OUTAGE_MEMORY_MS]
    for (const cookie of ['absent', 'expired', 'present'] as const) {
      for (const me of outcomes) {
        for (const confirm of outcomes) {
          for (const outageSeenMsAgo of outages) {
            const verdict = judgeSession({ cookie, me, confirm, outageSeenMsAgo })
            const signsOut = verdict.kind === 'signed-out' && verdict.reason === 'rejected'
            const allowed =
              cookie === 'present' &&
              me === unauthenticated &&
              confirm === unauthenticated &&
              (outageSeenMsAgo === undefined || outageSeenMsAgo >= OUTAGE_MEMORY_MS)
            expect({ cookie, me, confirm, outageSeenMsAgo, signsOut }).toEqual({
              cookie,
              me,
              confirm,
              outageSeenMsAgo,
              signsOut: allowed,
            })
          }
        }
      }
    }
  })

  describe('outage memory boundary', () => {
    const at = (outageSeenMsAgo: number) =>
      judgeSession({
        cookie: 'present',
        me: unauthenticated,
        confirm: unauthenticated,
        outageSeenMsAgo,
      })

    it('keeps the session one millisecond inside the window', () => {
      expect(at(OUTAGE_MEMORY_MS - 1)).toEqual(unknown('outage'))
    })

    it('signs out at the window and one millisecond after it', () => {
      expect(at(OUTAGE_MEMORY_MS)).toEqual(rejected)
      expect(at(OUTAGE_MEMORY_MS + 1)).toEqual(rejected)
    })

    it('is 30 seconds (owner decision D1)', () => {
      expect(OUTAGE_MEMORY_MS).toBe(30_000)
    })
  })
})

describe('meOutcomeFromError: by status and code only, never the message', () => {
  it.each([
    ['an HTTP 401', serverError(401), 'unauthenticated'],
    ['a GraphQL UNAUTHENTICATED', graphQLError('UNAUTHENTICATED'), 'unauthenticated'],
    ['an HTTP 502', serverError(502), 'unavailable'],
    ['an HTTP 503', serverError(503), 'unavailable'],
    ['an HTTP 504', serverError(504), 'unavailable'],
    ['a GraphQL 503', graphQLError('INTERNAL_SERVER_ERROR', 'Down', 503), 'unavailable'],
    ['no answer', new TypeError('Failed to fetch'), 'unavailable'],
    ['an HTTP 500', serverError(500), 'other'],
    [
      'a 500 whose message says Unauthorized',
      graphQLError('INTERNAL_SERVER_ERROR', 'Unauthorized'),
      'other',
    ],
    ['a FORBIDDEN', graphQLError('FORBIDDEN', 'Unauthorized'), 'other'],
    [
      'a plain Error that says UNAUTHENTICATED',
      new Error('UNAUTHENTICATED: Unauthorized'),
      'other',
    ],
  ])('%s', (_label, error, cause) => {
    expect(meOutcomeFromError(error)).toEqual({ kind: 'error', cause })
  })

  it('judges a 500 whose message says "Unauthorized" as answered-error, never a sign-out', () => {
    const me = meOutcomeFromError(graphQLError('INTERNAL_SERVER_ERROR', 'Unauthorized'))
    expect(judgeSession({ cookie: 'present', me, confirm: me })).toEqual(unknown('answered-error'))
  })

  it('treats an UNAUTHENTICATED beside a GraphQL 503 in the same answer as an outage', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        { message: 'x', extensions: { code: 'UNAUTHENTICATED' } },
        { message: 'y', extensions: { code: 'INTERNAL_SERVER_ERROR', status: 503 } },
      ],
    })
    expect(meOutcomeFromError(error)).toEqual({ kind: 'error', cause: 'unavailable' })
  })
})

describe('meOutcomeFromResult', () => {
  it('reads the user', () => {
    expect(meOutcomeFromResult<User>({ data: { me: ADA } })).toEqual(user)
  })

  it('reads null with no error as null', () => {
    expect(meOutcomeFromResult<User>({ data: { me: null } })).toEqual(empty)
    expect(meOutcomeFromResult<User>({ data: null })).toEqual(empty)
  })

  it('judges null beside an error by the error (a hidden 401 under errorPolicy all)', () => {
    expect(
      meOutcomeFromResult<User>({ data: { me: null }, error: graphQLError('UNAUTHENTICATED') }),
    ).toEqual(unauthenticated)
    expect(meOutcomeFromResult<User>({ data: { me: null }, error: serverError(500) })).toEqual(
      other,
    )
  })
})
