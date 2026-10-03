import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5000

interface SiteverifyResponse {
  success: boolean
  'error-codes'?: string[]
}

/**
 * Cloudflare Turnstile verification for the unauthenticated signup surface.
 *
 * Optional in the same sense Stripe is: with no TURNSTILE_SECRET_KEY configured the service is
 * disabled and every call is a no-op, so existing deployments and local dev keep working untouched.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  get enabled(): boolean {
    return this.config.get<boolean>('signupProtection.turnstile.enabled') === true
  }

  async assertValid(token: string | undefined): Promise<void> {
    if (!this.enabled) return

    if (!token?.trim()) {
      throw new BadRequestException('Captcha verification is required.')
    }

    if (!(await this.verify(token.trim()))) {
      throw new BadRequestException('Captcha verification failed. Please try again.')
    }
  }

  /**
   * Fails CLOSED on a verdict from Cloudflare (`success: false` means the token is bad) but OPEN on
   * transport trouble — a Cloudflare outage must not take registration down. The rate limit still
   * applies in that window, so failing open degrades to throttle + email hygiene rather than to the
   * wide-open endpoint this replaced.
   */
  private async verify(token: string): Promise<boolean> {
    // siteverify also accepts an optional `remoteip`. We deliberately omit it: the only client IP
    // available here comes from a spoofable header, and a forged value would fail the caller's own
    // signup rather than stop an attacker.
    const body = new URLSearchParams({
      secret: this.config.get<string>('signupProtection.turnstile.secretKey') ?? '',
      response: token,
    })

    try {
      const response = await firstValueFrom(
        this.http.post<SiteverifyResponse>(SITEVERIFY_URL, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: VERIFY_TIMEOUT_MS,
        }),
      )

      if (!response.data?.success) {
        const codes = response.data?.['error-codes']?.join(', ') || 'none'
        this.logger.warn(`Turnstile rejected a token (error-codes: ${codes})`)
        return false
      }
      return true
    } catch (error) {
      this.logger.error(
        `Turnstile siteverify unreachable, allowing signup through rate limit only: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
      return true
    }
  }
}
