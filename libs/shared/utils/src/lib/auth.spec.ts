import { isJwtExpired } from './auth'

// Build a JWT-shaped token ("header.payload.signature"); only the payload is decoded.
function tokenWithPayload(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${body}.signature`
}

describe('isJwtExpired', () => {
  const future = 9999999999
  const past = 1000000000

  it('treats a non-expired token as valid', () => {
    expect(isJwtExpired(tokenWithPayload({ sub: 'abc', exp: future }))).toBe(false)
  })

  it('treats an expired token as expired', () => {
    expect(isJwtExpired(tokenWithPayload({ sub: 'abc', exp: past }))).toBe(true)
  })

  it('treats a token without exp as not expired', () => {
    expect(isJwtExpired(tokenWithPayload({ sub: 'abc' }))).toBe(false)
  })

  it('treats a malformed token as expired', () => {
    expect(isJwtExpired('not-a-jwt')).toBe(true)
  })

  // Regression: base64url payloads can contain `-`/`_`, which plain atob() rejects.
  // Such a valid, non-expired token must not be misread as expired.
  it('decodes a base64url payload containing url-safe chars', () => {
    const payload = { sub: 'user_0>x', exp: future, iat: 1700000000 }
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    expect(body).toMatch(/[-_]/) // guard: this fixture actually exercises the url-safe path
    expect(isJwtExpired(`header.${body}.signature`)).toBe(false)
  })
})
