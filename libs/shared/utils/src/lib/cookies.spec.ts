import { describe, expect, it } from 'vitest'
import { getCookie, getJsonCookie, getSessionCookieName } from './cookies'

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
