import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'
import { TurnstileService } from './turnstile.service'

describe('TurnstileService', () => {
  let service: TurnstileService
  let config: Record<string, unknown>
  let post: jest.Mock

  const build = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurnstileService,
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
        { provide: HttpService, useValue: { post } },
      ],
    }).compile()
    service = module.get(TurnstileService)
  }

  beforeEach(async () => {
    post = jest.fn().mockReturnValue(of({ data: { success: true } }))
    config = {
      'signupProtection.turnstile.enabled': true,
      'signupProtection.turnstile.secretKey': 'test-secret',
    }
    await build()
  })

  describe('when disabled', () => {
    beforeEach(async () => {
      config['signupProtection.turnstile.enabled'] = false
      await build()
    })

    it('reports itself disabled', () => {
      expect(service.enabled).toBe(false)
    })

    it('accepts a missing token without calling Cloudflare', async () => {
      // Deployments with no TURNSTILE_SECRET_KEY must keep working untouched.
      await expect(service.assertValid(undefined)).resolves.toBeUndefined()
      expect(post).not.toHaveBeenCalled()
    })
  })

  describe('when enabled', () => {
    it('accepts a token Cloudflare verifies', async () => {
      await expect(service.assertValid('good-token')).resolves.toBeUndefined()
    })

    it('posts the secret and token as form-encoded data', async () => {
      await service.assertValid('good-token')

      const [url, body, options] = post.mock.calls[0]
      expect(url).toContain('challenges.cloudflare.com')
      expect(body).toContain('secret=test-secret')
      expect(body).toContain('response=good-token')
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    })

    it.each([undefined, '', '   '])('rejects a missing token (%p)', async token => {
      await expect(service.assertValid(token)).rejects.toThrow(BadRequestException)
      expect(post).not.toHaveBeenCalled()
    })

    it('rejects a token Cloudflare refuses', async () => {
      post.mockReturnValue(
        of({ data: { success: false, 'error-codes': ['invalid-input-response'] } }),
      )

      await expect(service.assertValid('bad-token')).rejects.toThrow(/verification failed/i)
    })

    it('fails OPEN when Cloudflare is unreachable', async () => {
      // A Cloudflare outage degrades to the rate limit rather than blocking all signups.
      post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')))

      await expect(service.assertValid('some-token')).resolves.toBeUndefined()
    })

    it('still requires a token to be present when Cloudflare is unreachable', async () => {
      post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')))

      await expect(service.assertValid(undefined)).rejects.toThrow(BadRequestException)
    })
  })
})
