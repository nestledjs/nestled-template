import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { ForwardedRequest, PublicUrlService } from './public-url.service'

/** A minimal stand-in for the Express request, carrying only the headers the service reads. */
function request(headers: Record<string, string>, protocol?: string): ForwardedRequest {
  return {
    protocol,
    get: (name: string) => headers[name.toLowerCase()],
  }
}

async function serviceWith(config: Record<string, unknown>): Promise<PublicUrlService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PublicUrlService,
      { provide: NestConfigService, useValue: { get: (key: string) => config[key] } },
    ],
  }).compile()
  return module.get(PublicUrlService)
}

describe('PublicUrlService', () => {
  describe('tier 1 — configured API_URL wins', () => {
    it('returns the configured origin and ignores a forged forwarded host', async () => {
      const service = await serviceWith({ apiUrl: 'https://api.muzebook.com', port: 8080 })

      const origin = service.origin(
        request({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.test' }),
      )

      expect(origin).toBe('https://api.muzebook.com')
    })
  })

  describe('tier 2 — proxy-forwarded request origin', () => {
    it('recovers the real public origin when API_URL is a bind address (PIR-223 production case)', async () => {
      const service = await serviceWith({ apiUrl: 'http://0.0.0.0:8080', host: '0.0.0.0', port: 8080 })

      const origin = service.origin(
        request({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.muzebook.com' }),
      )

      expect(origin).toBe('https://api.muzebook.com')
      expect(origin).not.toContain('0.0.0.0')
    })

    it('outranks a loopback API_URL — the shape an UNSET API_URL actually takes in production', async () => {
      // With API_URL unset, Joi defaults it from HOST/PORT and defaultOrigin rewrites the wildcard
      // bind host to localhost, so config.apiUrl is `http://localhost:8080`, not `http://0.0.0.0:8080`.
      // If a loopback config counted as "configured", the proxy fallback would never fire and a
      // member would still be handed an unreachable URL — just a different one.
      const service = await serviceWith({ apiUrl: 'http://localhost:8080', host: '0.0.0.0', port: 8080 })

      const origin = service.origin(
        request({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.muzebook.com' }),
      )

      expect(origin).toBe('https://api.muzebook.com')
    })

    it('takes the first (client-facing) hop of a comma-chained forwarded header', async () => {
      const service = await serviceWith({ apiUrl: 'http://0.0.0.0:8080', port: 8080 })

      const origin = service.origin(
        request({
          'x-forwarded-proto': 'https, http',
          'x-forwarded-host': 'api.muzebook.com, internal.railway',
        }),
      )

      expect(origin).toBe('https://api.muzebook.com')
    })

    it('falls back to req.protocol and the Host header when no proxy headers are present', async () => {
      const service = await serviceWith({ apiUrl: 'http://0.0.0.0:8080', port: 8080 })

      expect(service.origin(request({ host: 'api.muzebook.com' }, 'https'))).toBe(
        'https://api.muzebook.com',
      )
    })

    it('ignores a request whose own host is a bind address', async () => {
      const service = await serviceWith({ apiUrl: 'http://0.0.0.0:8080', port: 8080 })

      expect(service.origin(request({ 'x-forwarded-host': '0.0.0.0:8080' }, 'http'))).toBe(
        'http://localhost:8080',
      )
    })
  })

  describe('tier 3 — loopback config, the local-dev case', () => {
    it('keeps a loopback API_URL when there is no proxy to ask', async () => {
      const service = await serviceWith({ apiUrl: 'http://localhost:3000', port: 3000 })

      expect(service.origin()).toBe('http://localhost:3000')
      expect(service.origin(request({ host: 'localhost:3000' }, 'http'))).toBe(
        'http://localhost:3000',
      )
    })
  })

  describe('tier 4 — localhost', () => {
    it('never emits a bind address when there is no config and no request', async () => {
      const service = await serviceWith({ apiUrl: 'http://0.0.0.0:8080', host: '0.0.0.0', port: 8080 })

      const origin = service.origin()

      expect(origin).toBe('http://localhost:8080')
      expect(origin).not.toContain('0.0.0.0')
    })

    it('defaults the port to 3000 when nothing is configured at all', async () => {
      const service = await serviceWith({})

      expect(service.origin()).toBe('http://localhost:3000')
    })
  })

  describe('apiUrl', () => {
    it('joins to exactly one /api segment with no double slash', async () => {
      const service = await serviceWith({ apiUrl: 'https://api.muzebook.com' })

      expect(service.apiUrl('/hooks/crm/abc')).toBe('https://api.muzebook.com/api/hooks/crm/abc')
      expect(service.apiUrl('hooks/crm/abc')).toBe('https://api.muzebook.com/api/hooks/crm/abc')
      expect(new URL(service.apiUrl('/mcp')).pathname).toBe('/api/mcp')
    })

    it('self-heals a configured API_URL carrying a trailing slash or a /api suffix', async () => {
      const service = await serviceWith({ apiUrl: 'https://api.muzebook.com/api/' })

      expect(service.apiUrl('/mcp')).toBe('https://api.muzebook.com/api/mcp')
    })
  })
})
