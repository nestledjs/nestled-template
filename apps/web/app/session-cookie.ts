/**
 * The domain the API sets the session cookie for (its `Domain` attribute), as the web server sees
 * it: `VITE_COOKIE_DOMAIN`, else `API_COOKIE_DOMAIN` (the API's own variable, when the web service
 * is given it too). Undefined for a host-only cookie: nothing set, `localhost`, or an IP address,
 * which the API never uses as a cookie domain either.
 *
 * The web service must be given the same value as the API: set `API_COOKIE_DOMAIN` on it too (on
 * Railway, `${{api.API_COOKIE_DOMAIN}}`): a cookie the API set for the parent domain survives a sign-out
 * that only expires the host-only one, and the user is signed straight back in.
 */
export function sessionCookieDomain(): string | undefined {
  const domain = (process.env.VITE_COOKIE_DOMAIN || process.env.API_COOKIE_DOMAIN || '').trim()
  if (!domain || domain === 'localhost' || domain === '[::1]' || domain.startsWith('127.')) {
    return undefined
  }
  return domain
}

/**
 * `Set-Cookie` values that expire the session cookie `cookieName` wherever it may have been set:
 * the host-only cookie always, and the domain cookie as well when a cookie domain is configured
 * (`sessionCookieDomain`). Expiring only one of them left the other in place.
 */
export function expiredSessionCookies(cookieName: string): string[] {
  const base = `${cookieName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
  const domain = sessionCookieDomain()
  return domain ? [`${base}; Domain=${domain}`, base] : [base]
}
