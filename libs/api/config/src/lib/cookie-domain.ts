/**
 * Values of `API_COOKIE_DOMAIN` that mean "no `Domain` attribute" (a host-only cookie). Matched
 * exactly: a host such as `127.example.com` is an ordinary domain, not a loopback address.
 */
export const HOST_ONLY_COOKIE_DOMAINS: readonly string[] = ['localhost', '127.0.0.1', '[::1]']

/**
 * The `Domain` the API sets its session cookie for, from `API_COOKIE_DOMAIN`. The value may be a
 * comma-separated list; the first nonempty entry is the cookie's domain. Undefined (a host-only
 * cookie) when nothing is set or the entry is `localhost`, `127.0.0.1` or `[::1]`.
 *
 * The web server applies the same rule (apps/web/app/session/session-cookie.ts
 * `cookieDomainFromSetting`) to know which cookie a sign-out must expire; the two share the table
 * in their specs. Change both together.
 */
export function cookieDomainFromSetting(value: string | undefined): string | undefined {
  const domain = (value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .find(Boolean)
  if (!domain || HOST_ONLY_COOKIE_DOMAINS.includes(domain)) return undefined
  return domain
}
