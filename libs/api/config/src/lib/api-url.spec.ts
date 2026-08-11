import {
  defaultApiOrigin,
  defaultOrigin,
  isHttpOrigin,
  isLoopbackHost,
  isPublicApiOrigin,
  isReachableApiOrigin,
  isWildcardBindHost,
  normalizeApiOrigin,
} from './api-url'

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
    expect(defaultApiOrigin('api.example.com', 8080)).toBe('http://api.example.com:8080')
  })
  it('replaces a wildcard bind host with loopback (never emits an unreachable origin)', () => {
    // PIR-223: HOST=0.0.0.0 / PORT=8080 in a container made this default `http://0.0.0.0:8080`,
    // which then surfaced as the member-facing CRM webhook URL. A bind address is never reachable.
    expect(defaultApiOrigin('0.0.0.0', 8080)).toBe('http://localhost:8080')
    expect(defaultApiOrigin('::', 8080)).toBe('http://localhost:8080')
    expect(defaultApiOrigin('0.0.0.0', 8080)).not.toContain('0.0.0.0')
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

describe('isWildcardBindHost', () => {
  it('is true for wildcard bind addresses, in every spelling', () => {
    expect(isWildcardBindHost('0.0.0.0')).toBe(true)
    expect(isWildcardBindHost('::')).toBe(true)
    expect(isWildcardBindHost('[::]')).toBe(true)
    expect(isWildcardBindHost('::0')).toBe(true)
    expect(isWildcardBindHost(' 0.0.0.0 ')).toBe(true)
  })
  it('is true for the expanded IPv6 wildcard, padded or not, bracketed or not', () => {
    // HOST validation accepts any Joi `.ip()` spelling, so every one of these can reach config.
    expect(isWildcardBindHost('0:0:0:0:0:0:0:0')).toBe(true)
    expect(isWildcardBindHost('[0:0:0:0:0:0:0:0]')).toBe(true)
    expect(isWildcardBindHost('0000:0000:0000:0000:0000:0000:0000:0000')).toBe(true)
    expect(isWildcardBindHost('[0000:0000:0000:0000:0000:0000:0000:0000]')).toBe(true)
    expect(isWildcardBindHost('[::0]')).toBe(true)
  })
  it('is false for reachable hosts, including loopback', () => {
    expect(isWildcardBindHost('localhost')).toBe(false)
    expect(isWildcardBindHost('127.0.0.1')).toBe(false)
    expect(isWildcardBindHost('api.muzebook.com')).toBe(false)
  })
  it('is false for IPv6 literals that merely contain zero hextets', () => {
    expect(isWildcardBindHost('::1')).toBe(false)
    expect(isWildcardBindHost('[::1]')).toBe(false)
    expect(isWildcardBindHost('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(false)
  })
})

describe('isReachableApiOrigin', () => {
  it('rejects an origin built from a bind address', () => {
    expect(isReachableApiOrigin('http://0.0.0.0:8080')).toBe(false)
    // `new URL('http://[::]:8080').hostname` keeps the brackets, hence the bracketed entries.
    expect(isReachableApiOrigin('http://[::]:8080')).toBe(false)
  })
  it('accepts real public origins and loopback (loopback is correct in local dev)', () => {
    expect(isReachableApiOrigin('https://api.muzebook.com')).toBe(true)
    expect(isReachableApiOrigin('http://localhost:3000')).toBe(true)
    expect(isReachableApiOrigin('http://127.0.0.1:3000')).toBe(true)
  })
  it('rejects anything that is not an origin-only http(s) URL', () => {
    expect(isReachableApiOrigin('ftp://example.com')).toBe(false)
    expect(isReachableApiOrigin('https://api.muzebook.com/api')).toBe(false)
    expect(isReachableApiOrigin('not a url')).toBe(false)
    expect(isReachableApiOrigin('')).toBe(false)
  })
})

describe('isPublicApiOrigin', () => {
  it('is true only for an origin something outside this machine could reach', () => {
    expect(isPublicApiOrigin('https://api.muzebook.com')).toBe(true)
    expect(isPublicApiOrigin('http://api.example.com:8080')).toBe(true)
  })
  it('rejects loopback — the shape an UNSET API_URL takes once the bind host is rewritten', () => {
    expect(isPublicApiOrigin('http://localhost:8080')).toBe(false)
    expect(isPublicApiOrigin('http://127.0.0.1:3000')).toBe(false)
    expect(isPublicApiOrigin('http://[::1]:3000')).toBe(false)
  })
  it('rejects bind addresses and non-origins, like isReachableApiOrigin', () => {
    expect(isPublicApiOrigin('http://0.0.0.0:8080')).toBe(false)
    expect(isPublicApiOrigin('ftp://example.com')).toBe(false)
    expect(isPublicApiOrigin('')).toBe(false)
  })
})

describe('isLoopbackHost', () => {
  it('covers every loopback spelling', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('127.1.2.3')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('[::1]')).toBe(true)
  })
  it('is false for real hosts and for the wildcard bind address', () => {
    expect(isLoopbackHost('api.muzebook.com')).toBe(false)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
  })
})

describe('defaultOrigin with wildcard bind hosts', () => {
  it('substitutes loopback on the WEB_URL path too (same latent defect)', () => {
    expect(defaultOrigin('::', undefined, 4200)).toBe('http://localhost:4200')
    expect(defaultOrigin('0.0.0.0', undefined, 4200)).toBe('http://localhost:4200')
  })
})
