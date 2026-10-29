import { JwtService } from '@nestjs/jwt'
import { extractTokenFromWsContext } from './ws-session-token'

describe('extractTokenFromWsContext', () => {
  const originalSecret = process.env['JWT_SECRET']
  const originalName = process.env['VITE_COOKIE_NAME']
  const now = Math.floor(Date.now() / 1000)

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    delete process.env['VITE_COOKIE_NAME']
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env['JWT_SECRET']
    else process.env['JWT_SECRET'] = originalSecret
    if (originalName === undefined) delete process.env['VITE_COOKIE_NAME']
    else process.env['VITE_COOKIE_NAME'] = originalName
  })

  const contextWith = (...cookieHeaders: string[]) => ({
    request: { rawHeaders: cookieHeaders.flatMap(value => ['Cookie', value]) },
  })

  it.each([
    ['first', (valid: string, forged: string) => `__session=${forged}; __session=${valid}`],
    ['last', (valid: string, forged: string) => `__session=${valid}; __session=${forged}`],
  ])('uses the valid older session over a forged newer duplicate (forged %s)', (_l, header) => {
    const valid = new JwtService({ secret: 'test-secret' }).sign({ userId: 'u1', iat: now - 3600 })
    const forged = new JwtService({ secret: 'other-secret' }).sign({
      userId: 'u2',
      iat: now + 10 * 365 * 24 * 3600,
    })

    expect(extractTokenFromWsContext(contextWith(header(valid, forged)))).toBe(valid)
  })

  it('reads a value containing = in full and finds the cookie in a later Cookie header', () => {
    expect(extractTokenFromWsContext(contextWith('theme=dark', '__session=abc=='))).toBe('abc==')
  })

  it('returns an empty string when there is no session cookie or no request', () => {
    expect(extractTokenFromWsContext(contextWith('theme=dark'))).toBe('')
    expect(extractTokenFromWsContext({})).toBe('')
    expect(extractTokenFromWsContext(undefined)).toBe('')
  })
})
