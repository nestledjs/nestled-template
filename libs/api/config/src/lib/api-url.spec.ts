import { defaultApiOrigin, defaultOrigin, isHttpOrigin, normalizeApiOrigin } from './api-url'

describe('defaultApiOrigin', () => {
  it('defaults host to localhost and port to 3000', () => {
    expect(defaultApiOrigin()).toBe('http://localhost:3000')
  })
  it('falls back to port 3000 when PORT is unset (never :undefined)', () => {
    expect(defaultApiOrigin('localhost', undefined)).toBe('http://localhost:3000')
    expect(defaultApiOrigin('localhost', '')).toBe('http://localhost:3000')
  })
  it('trims a PORT set with surrounding whitespace', () => {
    expect(defaultApiOrigin('localhost', ' 3000 ')).toBe('http://localhost:3000')
  })
  it('honours an explicit host and port', () => {
    expect(defaultApiOrigin('0.0.0.0', 8080)).toBe('http://0.0.0.0:8080')
  })
})

describe('normalizeApiOrigin', () => {
  it('returns a clean origin unchanged', () => {
    expect(normalizeApiOrigin('https://api.example.com')).toBe('https://api.example.com')
  })
  it('strips a trailing slash', () => {
    expect(normalizeApiOrigin('https://api.example.com/')).toBe('https://api.example.com')
  })
  it('strips a trailing /api suffix (prevents /api/api/... and //api/mcp)', () => {
    expect(normalizeApiOrigin('https://api.example.com/api')).toBe('https://api.example.com')
    expect(normalizeApiOrigin('https://api.example.com/api/')).toBe('https://api.example.com')
  })
  it('trims surrounding whitespace', () => {
    expect(normalizeApiOrigin('  https://api.example.com/api  ')).toBe('https://api.example.com')
  })
  it('collapses any path, query, fragment, or credentials to the bare origin', () => {
    expect(normalizeApiOrigin('https://api.example.com/graphql')).toBe('https://api.example.com')
    expect(normalizeApiOrigin('https://api.example.com/foo?x=1#frag')).toBe(
      'https://api.example.com',
    )
    expect(normalizeApiOrigin('http://user:pass@api.example.com:3001/api')).toBe(
      'http://api.example.com:3001',
    )
  })
  it('falls back to the local-dev origin when empty or whitespace', () => {
    expect(normalizeApiOrigin(undefined, { port: 3000 })).toBe('http://localhost:3000')
    expect(normalizeApiOrigin('   ', { port: 3000 })).toBe('http://localhost:3000')
  })
})

describe('isHttpOrigin', () => {
  it('accepts http and https origins (with or without a port)', () => {
    expect(isHttpOrigin('http://localhost:3000')).toBe(true)
    expect(isHttpOrigin('https://api.example.com')).toBe(true)
  })
  it('rejects non-http(s) or unparseable values', () => {
    expect(isHttpOrigin('ftp://example.com')).toBe(false)
    expect(isHttpOrigin('not a url')).toBe(false)
    expect(isHttpOrigin('')).toBe(false)
  })
  it('rejects origin-plus-path/query/fragment/credentials (not origin-only)', () => {
    expect(isHttpOrigin('https://api.example.com/graphql')).toBe(false)
    expect(isHttpOrigin('https://api.example.com?x=1')).toBe(false)
    expect(isHttpOrigin('https://api.example.com#frag')).toBe(false)
    expect(isHttpOrigin('http://user:pass@api.example.com')).toBe(false)
  })
})

describe('defaultOrigin', () => {
  it('applies the caller-supplied port fallback when the port is unset or blank', () => {
    // A Joi `.default()` reads process.env directly and cannot see a sibling key's Joi default,
    // so each *_URL default must pass its own fallback. WEB_URL previously omitted this and
    // rendered `http://localhost:undefined`.
    expect(defaultOrigin(undefined, undefined, 4200)).toBe('http://localhost:4200')
    expect(defaultOrigin('localhost', '', 4200)).toBe('http://localhost:4200')
    expect(defaultOrigin(undefined, undefined, 4200)).not.toContain('undefined')
  })
  it('honours an explicit port over the fallback, and trims it', () => {
    expect(defaultOrigin('example.com', ' 8080 ', 4200)).toBe('http://example.com:8080')
  })
  it('defaults the fallback port to 3000 to match defaultApiOrigin', () => {
    expect(defaultOrigin()).toBe(defaultApiOrigin())
  })
})

describe('defaultOrigin with IPv6 hosts', () => {
  // HOST validation accepts Joi.string().ip(), which includes IPv6. An unbracketed IPv6 literal
  // produces an unparseable URL (`http://::1:3000`) that fails isHttpOrigin() and takes down
  // startup — so defaultOrigin must bracket it per RFC 3986.
  it('brackets IPv6 literals so the result is a valid origin', () => {
    expect(defaultOrigin('::1', undefined, 3000)).toBe('http://[::1]:3000')
    expect(defaultOrigin('2001:db8::1', '4200', 3000)).toBe('http://[2001:db8::1]:4200')
    expect(isHttpOrigin(defaultOrigin('::1', undefined, 3000))).toBe(true)
    expect(isHttpOrigin(defaultOrigin('2001:db8::1', undefined, 4200))).toBe(true)
  })
  it('does not double-bracket an already-bracketed literal', () => {
    expect(defaultOrigin('[::1]', undefined, 3000)).toBe('http://[::1]:3000')
  })
  it('leaves hostnames and IPv4 untouched', () => {
    expect(defaultOrigin('localhost', undefined, 3000)).toBe('http://localhost:3000')
    expect(defaultOrigin('127.0.0.1', undefined, 3000)).toBe('http://127.0.0.1:3000')
  })
})
