import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeBase64UrlSegment } from './base64url'
import {
  decodeCookieValue,
  getCookie,
  getJsonCookie,
  getSessionCookieName,
  JWT_IAT_CLOCK_SKEW_SECONDS,
  pickNewestJwt,
} from './cookies'

function jwt(iat: number): string {
  const payload = Buffer.from(JSON.stringify({ iat })).toString('base64url')
  return `header.${payload}.signature`
}

describe('cookie utilities', () => {
  it('uses the configured session cookie name with a default fallback', () => {
    const original = process.env.VITE_COOKIE_NAME
    delete process.env.VITE_COOKIE_NAME
    expect(getSessionCookieName()).toBe('__session')

    process.env.VITE_COOKIE_NAME = '__custom'
    expect(getSessionCookieName()).toBe('__custom')

    if (original === undefined) delete process.env.VITE_COOKIE_NAME
    else process.env.VITE_COOKIE_NAME = original
  })

  it('reads duplicate cookies by selecting the newest JWT', () => {
    const older = jwt(1)
    const newer = jwt(2)
    const headers = new Headers({ cookie: `session=${older}; theme=dark; session=${newer}` })

    expect(getCookie(headers, 'session')).toBe(newer)
    expect(getCookie({ cookie: 'plain=value' }, 'plain')).toBe('value')
    expect(getCookie({ cookie: '' }, 'missing')).toBeUndefined()
  })

  it('parses JSON cookies defensively', () => {
    expect(
      getJsonCookie<{ theme: string }>({ cookie: 'prefs=%7B%22theme%22%3A%22dark%22%7D' }, 'prefs'),
    ).toEqual({
      theme: 'dark',
    })
    expect(getJsonCookie({ cookie: 'prefs=not-json' }, 'prefs')).toBeNull()
    expect(getJsonCookie({ cookie: '' }, 'prefs')).toBeNull()
  })
})

describe('session cookie picking with untrusted payloads', () => {
  // The client cannot verify signatures, so it must not let a payload's own claims win outright.
  const now = 1_800_000_000
  const token = (payload: Record<string, number>) =>
    `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['first', (valid: string, forged: string) => [forged, valid]],
    ['last', (valid: string, forged: string) => [valid, forged]],
  ])('ignores a cookie whose iat is far in the future (forged %s)', (_label, arrange) => {
    const valid = token({ iat: now - 3600, exp: now + 3600 })
    const forged = token({ iat: now + 10 * 365 * 24 * 3600 })

    expect(pickNewestJwt(arrange(valid, forged), now)).toBe(valid)
  })

  it('tolerates an iat within the clock-skew allowance', () => {
    const older = token({ iat: now - 60 })
    const slightlyAhead = token({ iat: now + JWT_IAT_CLOCK_SKEW_SECONDS - 1 })

    expect(pickNewestJwt([slightlyAhead, older], now)).toBe(slightlyAhead)
  })

  it('lets an unexpired token beat an expired one even when the expired one is newer', () => {
    const unexpired = token({ iat: now - 7200, exp: now + 3600 })
    const expiredNewer = token({ iat: now - 60, exp: now - 1 })

    expect(pickNewestJwt([unexpired, expiredNewer], now)).toBe(unexpired)
    expect(pickNewestJwt([expiredNewer, unexpired], now)).toBe(unexpired)
  })

  it('still picks the newest when every token is expired', () => {
    const older = token({ iat: now - 7200, exp: now - 3600 })
    const newer = token({ iat: now - 3000, exp: now - 60 })

    expect(pickNewestJwt([newer, older], now)).toBe(newer)
  })
})

describe('session cookie picking without Buffer', () => {
  // Browsers have no Buffer and the web bundle polyfills nothing. Decoding through it threw inside
  // the picker's catch, so every token looked malformed and the LAST value won -- which can be the
  // stale session. Buffer is stubbed away around each pure call only.
  function withoutBuffer<T>(run: () => T): T {
    vi.stubGlobal('Buffer', undefined)
    try {
      return run()
    } finally {
      vi.unstubAllGlobals()
    }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('picks the newest token when the older cookie comes first', () => {
    const older = jwt(1)
    const newer = jwt(2)
    const headers = new Headers({ cookie: `__session=${older}; __session=${newer}` })

    expect(withoutBuffer(() => getCookie(headers, '__session'))).toBe(newer)
  })

  it('picks the newest token when the newer cookie comes first', () => {
    const older = jwt(1)
    const newer = jwt(2)
    const headers = new Headers({ cookie: `__session=${newer}; theme=dark; __session=${older}` })

    expect(withoutBuffer(() => getCookie(headers, '__session'))).toBe(newer)
  })

  it('skips a malformed token rather than letting it win by position', () => {
    const newer = jwt(2)
    const headers = new Headers({ cookie: `__session=${newer}; __session=not.a-valid.jwt` })

    expect(withoutBuffer(() => getCookie(headers, '__session'))).toBe(newer)
  })

  it('returns a single session cookie as-is', () => {
    const only = jwt(5)

    expect(withoutBuffer(() => getCookie({ cookie: `__session=${only}` }, '__session'))).toBe(only)
  })

  it('warns when no duplicate decodes and the choice falls back to position', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(pickNewestJwt(['a.%%%.c', 'x.y'])).toBe('x.y')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not decode any of 2'))
  })
})

describe('malformed cookie encoding', () => {
  // The cookie header carries every cookie visible to the request, including ones another app set
  // on a parent domain. One bad `%` sequence made decodeURIComponent throw, the root loader throw,
  // and every route return 500.
  it('does not throw on a malformed % sequence in an unrelated cookie', () => {
    const token = jwt(3)
    const headers = new Headers({ cookie: `other=%E0%A4%A; __session=${token}; theme=light` })

    expect(() => getCookie(headers, '__session')).not.toThrow()
    expect(getCookie(headers, '__session')).toBe(token)
    expect(getCookie(headers, 'theme')).toBe('light')
    expect(getCookie(headers, 'other')).toBe('%E0%A4%A')
  })

  it('keeps the raw value of a malformed session cookie', () => {
    expect(getCookie({ cookie: '__session=abc%zz' }, '__session')).toBe('abc%zz')
  })

  it('still decodes well-formed percent-encoding', () => {
    expect(decodeCookieValue('a%20b')).toBe('a b')
    expect(decodeCookieValue('100%')).toBe('100%')
  })
})

describe('decodeBase64UrlSegment', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('decodes a JWT payload segment without Buffer', () => {
    const payload = { iat: 2, name: 'Zoë' }
    const segment = Buffer.from(JSON.stringify(payload)).toString('base64url')

    vi.stubGlobal('Buffer', undefined)
    expect(JSON.parse(decodeBase64UrlSegment(segment))).toEqual(payload)
  })

  it('restores padding that base64url omits', () => {
    const segment = Buffer.from('a').toString('base64url').replaceAll('=', '')

    expect(decodeBase64UrlSegment(segment)).toBe('a')
  })

  it('decodes the URL-safe alphabet', () => {
    const payload = { sub: 'a~b?c>d' }
    const segment = Buffer.from(JSON.stringify(payload)).toString('base64url')

    expect(JSON.parse(decodeBase64UrlSegment(segment))).toEqual(payload)
  })

  it('prefers Buffer where it exists so SSR keeps one decoder', () => {
    const atobSpy = vi.fn(() => 'should not be called')
    vi.stubGlobal('atob', atobSpy)
    const segment = Buffer.from(JSON.stringify({ iat: 7 })).toString('base64url')

    expect(JSON.parse(decodeBase64UrlSegment(segment))).toEqual({ iat: 7 })
    expect(atobSpy).not.toHaveBeenCalled()
  })

  it('throws a clear error rather than guessing when no decoder exists', () => {
    const segment = Buffer.from(JSON.stringify({ iat: 1 })).toString('base64url')
    vi.stubGlobal('Buffer', undefined)
    vi.stubGlobal('atob', () => 'unused')
    vi.stubGlobal('TextDecoder', undefined)

    expect(() => decodeBase64UrlSegment(segment)).toThrow(/neither Buffer nor atob/)
  })
})
