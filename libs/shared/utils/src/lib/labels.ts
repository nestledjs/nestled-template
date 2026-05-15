/**
 * Produce a user-facing label, preferring name then email then id
 */
export function personLabel(
  input: { firstName?: string | null; lastName?: string | null; email?: string | null; id: string },
): string {
  const first = (input.firstName ?? '').trim()
  const last = (input.lastName ?? '').trim()
  const name = `${first} ${last}`.trim()
  return name || input.email || input.id
}


