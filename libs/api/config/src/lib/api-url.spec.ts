import { defaultApiOrigin, isHttpOrigin, normalizeApiOrigin } from './api-url'

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
