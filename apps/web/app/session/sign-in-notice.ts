/**
 * Why a page sent the visitor to the login form, as router state: it cannot be put in a link, and
 * the form shows its own words for a reason it knows, never text it was given.
 */
export const TWO_FACTOR_INVITATION = { signInReason: 'two-factor-invitation' } as const

const NOTICES: ReadonlyMap<unknown, string> = new Map([
  [
    TWO_FACTOR_INVITATION.signInReason,
    'This account uses two-factor authentication. Log in here with your password and code, and you will return to the invitation.',
  ],
])

/** What the login form says above its fields for the router state it was opened with, if anything. */
export function signInNotice(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('signInReason' in state)) return undefined
  return NOTICES.get(state.signInReason)
}
