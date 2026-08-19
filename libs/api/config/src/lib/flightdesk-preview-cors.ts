/**
 * CORS support for FlightDesk preview environments.
 *
 * FlightDesk deploys a per-task preview of the web app on a random host under
 * `preview.flightdesk.dev` (e.g. `https://<task>.preview.flightdesk.dev`), so those origins can
 * never be enumerated in the exact-match CORS allowlist apiCorsOrigins builds — a `*.` entry there
 * silently matches nothing. main.ts matches them by pattern instead, after that allowlist.
 *
 * This grant is CREDENTIALED: previews run the real web app, which signs in with the session
 * cookie. That is acceptable only while preview subdomains are created exclusively by your own
 * FlightDesk organization. If previews ever become multi-tenant under this domain, any tenant's
 * preview could ride a signed-in user's session — at that point this pattern must be replaced with
 * a per-deploy exact origin injected into the allowlist.
 */
// Label characters are the ones a browser can actually put in an Origin host — letters, digits,
// hyphen (RFC 1123). Deliberately narrower than `\w`, which would also admit underscores.
export const FLIGHTDESK_PREVIEW_ORIGIN_PATTERN = /^https:\/\/(?:[a-z0-9-]+\.)+preview\.flightdesk\.dev$/i

export function isFlightDeskPreviewOrigin(origin: string | undefined): boolean {
  return !!origin && FLIGHTDESK_PREVIEW_ORIGIN_PATTERN.test(origin)
}
