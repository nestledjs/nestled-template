/**
 * Values that mean "no `Domain` attribute" (a host-only cookie). Matched exactly, as the API
 * matches them: a host such as `127.example.com` is an ordinary domain, not a loopback address.
 */
const HOST_ONLY_COOKIE_DOMAINS: readonly string[] = ['localhost', '127.0.0.1', '[::1]']

/**
 * The API's rule for the session cookie's `Domain` (libs/api/config cookie-domain.ts
 * `cookieDomainFromSetting`), repeated here because the web server cannot import the API's
 * config. The value may be a comma-separated list; its first nonempty entry is the domain.
 * Undefined (host-only) when nothing is set or the entry is `localhost`, `127.0.0.1` or `[::1]`.
 * apps/web/tests/session-cookie.spec.ts and libs/api/config cookie-domain.spec.ts run the same
 * table against both copies; change them together.
 */
export function cookieDomainFromSetting(value: string | undefined): string | undefined {
  const domain = (value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .find(Boolean)
  if (!domain || HOST_ONLY_COOKIE_DOMAINS.includes(domain)) return undefined
  return domain
}

/** Where the cookie-domain settings are read from. A parameter only so specs can pin each one. */
export interface CookieDomainSources {
  /** The web server's environment at runtime (`process.env`). */
  runtime?: Record<string, string | undefined>
  /** Values Vite inlined at build time (`import.meta.env`). */
  buildTime?: Record<string, string | undefined>
}

function defaultSources(): CookieDomainSources {
  return {
    runtime: globalThis.process?.env,
    buildTime: { VITE_COOKIE_DOMAIN: import.meta.env.VITE_COOKIE_DOMAIN as string | undefined },
  }
}

export interface SessionCookieDomainOptions {
  /**
   * For an app whose API derives the cookie's domain from the request host instead of reading
   * `API_COOKIE_DOMAIN`: the domain it derives for this request. Used only when no cookie-domain
   * setting is present, and checked by the same rule. The template's API never derives one, so
   * the template passes none.
   */
  hostDerivedDomain?: string
}

/**
 * The domain the API sets the session cookie for (its `Domain` attribute), as the web server sees
 * it. The first of these that is set decides: `VITE_COOKIE_DOMAIN` at runtime, `VITE_COOKIE_DOMAIN`
 * inlined at build time, then `API_COOKIE_DOMAIN` (the API's own variable, when the web service
 * is given it too); each is read by the API's rule (`cookieDomainFromSetting`). With none set,
 * `options.hostDerivedDomain`, by the same rule. Undefined for a host-only cookie.
 *
 * The web service must be given the same value as the API: set `API_COOKIE_DOMAIN` on it too (on
 * Railway, `${{api.API_COOKIE_DOMAIN}}`): a cookie the API set for the parent domain survives a sign-out
 * that only expires the host-only one, and the user is signed straight back in.
 */
export function sessionCookieDomain(
  options: SessionCookieDomainOptions = {},
  sources: CookieDomainSources = defaultSources(),
): string | undefined {
  const setting = [
    sources.runtime?.['VITE_COOKIE_DOMAIN'],
    sources.buildTime?.['VITE_COOKIE_DOMAIN'],
    sources.runtime?.['API_COOKIE_DOMAIN'],
  ].find(value => value?.trim())
  return cookieDomainFromSetting(setting ?? options.hostDerivedDomain)
}

/**
 * `Set-Cookie` values that expire the session cookie `cookieName` wherever it may have been set:
 * the host-only cookie always, and the domain cookie as well when there is a cookie domain
 * (`sessionCookieDomain`). Expiring only one of them left the other in place.
 */
export function expiredSessionCookies(
  cookieName: string,
  options: SessionCookieDomainOptions = {},
  sources?: CookieDomainSources,
): string[] {
  const base = `${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
  const domain = sessionCookieDomain(options, sources)
  return domain ? [`${base}; Domain=${domain}`, base] : [base]
}
