import { JwtService } from '@nestjs/jwt'
import {
  cookieValuesFromHeader,
  orderSessionTokensNewestFirst,
  pickVerifiedSessionToken,
  rawHeaderCookieValues,
  requestCookieValues,
  selectSessionToken,
} from './session-cookie'

const SECRET = 'test-secret'
const now = Math.floor(Date.now() / 1000)
const signer = new JwtService({ secret: SECRET })
const forger = new JwtService({ secret: 'not-the-api-secret' })

function verify(token: string): object | null {
  try {
    return signer.verify<object>(token)
  } catch {
    return null
  }
}

function unsigned(iat: number): string {
  return `header.${Buffer.from(JSON.stringify({ iat })).toString('base64url')}.signature`
}

describe('session cookie values', () => {
  it('collects every same-name value in header order, decoded, keeping = in values', () => {
    expect(
      cookieValuesFromHeader('a=1; __session=x%3Dy; theme=dark; __session=z==', '__session'),
    ).toEqual(['x=y', 'z=='])
  })

  it('keeps a badly encoded value raw instead of throwing', () => {
    expect(cookieValuesFromHeader('__session=%E0%A4%A; other=%', '__session')).toEqual(['%E0%A4%A'])
  })

  it('reads every Cookie header in rawHeaders, not just the first', () => {
    const rawHeaders = ['Host', 'api.example.com', 'Cookie', '__session=a', 'cookie', '__session=b']
    expect(rawHeaderCookieValues(rawHeaders, '__session')).toEqual(['a', 'b'])
  })

  it('prefers the raw header, which keeps duplicates, over cookie-parser', () => {
    const req = { headers: { cookie: '__session=a; __session=b' }, cookies: { __session: 'a' } }
    expect(requestCookieValues(req, '__session')).toEqual(['a', 'b'])
    expect(requestCookieValues({ headers: {}, cookies: { __session: 'a' } }, '__session')).toEqual([
      'a',
    ])
    expect(requestCookieValues(undefined, '__session')).toEqual([])
  })
})

describe('session token selection', () => {
  it('orders newest first, later value first on ties, non-JWTs last', () => {
    const one = unsigned(1)
    const twoA = unsigned(2)
    const twoB = `${unsigned(2)}x`
    expect(orderSessionTokensNewestFirst(['opaque-a', one, twoA, 'opaque-b', twoB])).toEqual([
      twoB,
      twoA,
      one,
      'opaque-b',
      'opaque-a',
    ])
  })

  it.each([
    ['first', (valid: string, forged: string) => [forged, valid]],
    ['last', (valid: string, forged: string) => [valid, forged]],
  ])(
    'never lets a forged far-future token shadow a valid older one (forged %s)',
    (_label, arrange) => {
      const valid = signer.sign({ userId: 'u1', iat: now - 3600 })
      const forged = forger.sign({ userId: 'u2', iat: now + 10 * 365 * 24 * 3600 })
      const values = arrange(valid, forged)

      expect(selectSessionToken(values, verify)).toBe(valid)
      expect(pickVerifiedSessionToken(values, verify)).toEqual({
        token: valid,
        claims: expect.objectContaining({ userId: 'u1' }),
      })
    },
  )

  it('picks the newest of several valid tokens', () => {
    const older = signer.sign({ userId: 'u1', iat: now - 60 })
    const newer = signer.sign({ userId: 'u1', iat: now - 5 })
    expect(selectSessionToken([newer, older], verify)).toBe(newer)
    expect(selectSessionToken([older, newer], verify)).toBe(newer)
  })

  it('falls back to the newest candidate when none verifies, so the caller fails as before', () => {
    const a = unsigned(1)
    const b = unsigned(2)
    expect(selectSessionToken([b, a], verify)).toBe(b)
    expect(pickVerifiedSessionToken([a, b], verify)).toBeNull()
  })

  it('returns a lone value without verifying it, and nothing for no values', () => {
    const verifySpy = jest.fn(verify)
    expect(selectSessionToken(['only'], verifySpy)).toBe('only')
    expect(selectSessionToken([], verifySpy)).toBeUndefined()
    expect(verifySpy).not.toHaveBeenCalled()
  })
})
