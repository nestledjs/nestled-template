import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { promises as dns } from 'node:dns'
import { EmailHygieneService } from './email-hygiene.service'

jest.mock('node:dns', () => ({
  promises: {
    resolveMx: jest.fn(),
    resolve4: jest.fn(),
    resolve6: jest.fn(),
  },
}))

const resolveMx = dns.resolveMx as jest.MockedFunction<typeof dns.resolveMx>
const resolve4 = dns.resolve4 as jest.MockedFunction<typeof dns.resolve4>
const resolve6 = dns.resolve6 as jest.MockedFunction<typeof dns.resolve6>

const dnsError = (code: string) => Object.assign(new Error(code), { code })

describe('EmailHygieneService', () => {
  let service: EmailHygieneService
  let config: Record<string, unknown>

  beforeEach(async () => {
    jest.clearAllMocks()
    config = {
      'signupProtection.blockDisposable': true,
      'signupProtection.requireMx': true,
      'signupProtection.mxTimeoutMs': 3000,
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailHygieneService,
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
      ],
    }).compile()

    service = module.get(EmailHygieneService)
    // Default to a domain that resolves cleanly; individual tests narrow this. Both address
    // lookups need an explicit default or an unstubbed one returns undefined and blows up the
    // fallback path rather than the assertion under test.
    resolveMx.mockResolvedValue([{ exchange: 'mx.example.net', priority: 10 }])
    resolve4.mockResolvedValue([])
    resolve6.mockResolvedValue([])
  })

  describe('disposable domains', () => {
    it('rejects a known disposable domain', async () => {
      await expect(service.assertUsableForSignup('bot@mailinator.com')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('rejects a subdomain of a wildcard disposable domain', () => {
      expect(service.isDisposable('anything.10mail.org')).toBe(true)
    })

    it('does not treat a domain merely ending in a disposable name as disposable', () => {
      // "not10mail.org" ends with "10mail.org" as a substring but is a different registrable
      // domain — matching on bare endsWith would reject it.
      expect(service.isDisposable('not10mail.org')).toBe(false)
    })

    it('allows a normal domain', async () => {
      await expect(service.assertUsableForSignup('real@gmail.com')).resolves.toBeUndefined()
    })

    it('skips the check when blockDisposable is off', async () => {
      config['signupProtection.blockDisposable'] = false
      await expect(service.assertUsableForSignup('bot@mailinator.com')).resolves.toBeUndefined()
    })
  })

  describe('MX checking', () => {
    it('accepts a domain with an MX record', async () => {
      await expect(service.assertUsableForSignup('user@example.net')).resolves.toBeUndefined()
      expect(resolveMx).toHaveBeenCalledWith('example.net')
    })

    it('falls back to an A record when no MX exists (RFC 5321 implicit MX)', async () => {
      resolveMx.mockResolvedValue([])
      resolve4.mockResolvedValue(['203.0.113.10'])

      await expect(service.assertUsableForSignup('user@example.net')).resolves.toBeUndefined()
      expect(resolve4).toHaveBeenCalledWith('example.net')
    })

    it('falls back to an AAAA record for an IPv6-only domain', async () => {
      resolveMx.mockResolvedValue([])
      resolve4.mockResolvedValue([])
      resolve6.mockResolvedValue(['2001:db8::1'])

      await expect(service.assertUsableForSignup('user@example.net')).resolves.toBeUndefined()
    })

    it('rejects a domain with no MX and no address records', async () => {
      resolveMx.mockResolvedValue([])
      resolve4.mockResolvedValue([])
      resolve6.mockResolvedValue([])

      await expect(service.assertUsableForSignup('user@typo.example')).rejects.toThrow(
        /could not find a mail server/i,
      )
    })

    it('rejects a domain that does not exist', async () => {
      resolveMx.mockRejectedValue(dnsError('ENOTFOUND'))
      resolve4.mockRejectedValue(dnsError('ENOTFOUND'))
      resolve6.mockRejectedValue(dnsError('ENOTFOUND'))

      await expect(service.assertUsableForSignup('user@nope.invalid')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('fails OPEN when the resolver itself is broken', async () => {
      // A DNS outage must not take registration down with it.
      resolveMx.mockRejectedValue(dnsError('SERVFAIL'))

      await expect(service.assertUsableForSignup('user@example.net')).resolves.toBeUndefined()
    })

    it('fails OPEN when the lookup exceeds the timeout', async () => {
      config['signupProtection.mxTimeoutMs'] = 10
      resolveMx.mockImplementation(() => new Promise(() => undefined)) // never settles

      await expect(service.assertUsableForSignup('user@example.net')).resolves.toBeUndefined()
    })

    it('skips the lookup entirely when requireMx is off', async () => {
      config['signupProtection.requireMx'] = false
      await expect(service.assertUsableForSignup('user@example.net')).resolves.toBeUndefined()
      expect(resolveMx).not.toHaveBeenCalled()
    })
  })

  describe('malformed addresses', () => {
    it.each(['no-at-sign', '@leading.com', 'trailing@'])('rejects %s', async email => {
      await expect(service.assertUsableForSignup(email)).rejects.toThrow(BadRequestException)
    })
  })
})
