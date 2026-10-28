/**
 * Decode a base64url segment (a JWT header or payload) to a UTF-8 string, in both runtimes.
 *
 * This is the one client-side decoder: the cookie picker, the Apollo token resolver and the expiry
 * check all go through it. It lives here, in the lowest shared lib, so `shared/apollo` can import
 * it without `shared/utils` ever needing to import Apollo back.
 *
 * `Buffer` is Node-only and the web bundle polyfills nothing, so decoding through it threw a
 * ReferenceError on every token in the browser. The throw never surfaced: a caller's `catch`
 * treats it as a malformed token and falls back to the last cookie value, which can be the stale
 * session — `document.cookie` orders by path specificity rather than by age.
 *
 * Padding is restored explicitly because base64url omits it and `atob` requires it.
 *
 * `Buffer` is preferred where it exists, so server rendering keeps a single decoder rather than
 * silently switching to the browser one on a Node version that happens to expose `atob`. The
 * `atob` branch requires `TextDecoder` as well: guarding on `atob` alone would throw in a runtime
 * that has one and not the other, and that throw would land in the caller's catch and restore the
 * very silent fallback this function exists to remove.
 *
 * An exhausted decoder throws rather than returning something plausible.
 */
export function decodeBase64UrlSegment(segment: string): string {
  const base64 = segment.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8')
  }

  if (typeof atob === 'function' && typeof TextDecoder === 'function') {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, character => character.codePointAt(0) ?? 0)
    return new TextDecoder().decode(bytes)
  }

  throw new Error(
    'No base64 decoder available: this runtime provides neither Buffer nor atob with TextDecoder',
  )
}
