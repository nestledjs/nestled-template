import {
  canonicalResource,
  firstForwardedValue,
  isSameResource,
  requestMcpResource,
  requestOrigin,
} from './mcp-resource'

describe('MCP resource indicators', () => {
  it.each([
    ['https://api.example.com/api/mcp', 'https://api.example.com/api/mcp'],
    ['HTTPS://API.Example.COM/api/mcp', 'https://api.example.com/api/mcp'],
    ['https://api.example.com/api/mcp/', 'https://api.example.com/api/mcp'],
    ['https://api.example.com:443/api/mcp', 'https://api.example.com/api/mcp'],
    ['http://localhost:3000/api/mcp', 'http://localhost:3000/api/mcp'],
    ['https://api.example.com/', 'https://api.example.com'],
  ])('canonicalises %s', (value, expected) => {
    expect(canonicalResource(value)).toBe(expected)
  })

  it.each(['api.example.com/api/mcp', 'https://api.example.com/api/mcp#x', 'mcp://x/y', ''])(
    'refuses %s',
    value => {
      expect(canonicalResource(value)).toBeNull()
    },
  )

  it('names the MCP endpoint of the origin a request reached, behind a proxy too', () => {
    const direct = {
      protocol: 'http',
      get: (n: string) => (n === 'host' ? 'localhost:3000' : undefined),
    }
    const proxied = {
      protocol: 'http',
      get: (n: string) =>
        ({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'API.example.com',
          host: 'internal:3000',
        })[n],
    }

    expect(requestMcpResource(direct)).toBe('http://localhost:3000/api/mcp')
    expect(requestMcpResource(proxied)).toBe('https://api.example.com/api/mcp')
  })

  it('compares resources in canonical form', () => {
    expect(
      isSameResource('https://API.example.com/api/mcp/', 'https://api.example.com/api/mcp'),
    ).toBe(true)
    expect(
      isSameResource('https://api.example.com/api/mcp', 'https://other.example.com/api/mcp'),
    ).toBe(false)
    expect(isSameResource('not a url', 'not a url')).toBe(false)
  })

  it('takes the first entry of a comma-separated forwarding header', () => {
    expect(firstForwardedValue('https, http')).toBe('https')
    expect(firstForwardedValue(' api.example.com ,internal')).toBe('api.example.com')
    expect(firstForwardedValue('')).toBeUndefined()
    expect(firstForwardedValue(' , x')).toBeUndefined()
    expect(firstForwardedValue(undefined)).toBeUndefined()

    const chained = {
      protocol: 'http',
      get: (n: string) =>
        ({
          'x-forwarded-proto': 'https,http',
          'x-forwarded-host': 'api.example.com, lb.internal',
          host: 'internal:3000',
        })[n],
    }
    expect(requestOrigin(chained)).toBe('https://api.example.com')
    expect(requestMcpResource(chained)).toBe('https://api.example.com/api/mcp')
  })
})
