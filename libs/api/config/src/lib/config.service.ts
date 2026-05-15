import { Injectable } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { CookieOptions } from 'express'

@Injectable()
export class ConfigService {
  constructor(public readonly config: NestConfigService) {}

  get environment(): string {
    return this.config.getOrThrow<string>('environment')
  }

  get apiUrl(): string {
    return this.config.getOrThrow<string>('apiUrl')
  }

  get apiCorsOrigins(): string[] {
    return this.config.get<string[]>('api.cors.origin') ?? []
  }

  get cookie(): { name: string; secret: string; options: CookieOptions } {
    return this.config.getOrThrow<{ name: string; secret: string; options: CookieOptions }>(
      'api.cookie',
    )
  }

  get prefix(): string {
    return this.config.getOrThrow<string>('prefix')
  }

  get port(): number {
    return this.config.getOrThrow<number>('port')
  }

  get host(): string {
    return this.config.getOrThrow<string>('host')
  }

  get appEmail(): string {
    return this.config.getOrThrow<string>('app.email')
  }

  get appSupportEmail(): string {
    return this.config.getOrThrow<string>('app.supportEmail')
  }

  get appAdminEmails(): string {
    return this.config.getOrThrow<string>('app.adminEmails')
  }

  get appName(): string {
    return this.config.getOrThrow<string>('app.name')
  }

  get siteUrl(): string {
    return this.config.getOrThrow<string>('siteUrl')
  }

  get emailProvider(): string {
    const provider = this.config.get<string>('email.provider')
    if (provider) {
      return provider
    }

    // Auto-detect: if SMTP is configured, use it; otherwise use mock
    const smtpHost = this.config.get<string>('smtp.host')
    return smtpHost ? 'smtp' : 'mock'
  }

  get frontendUrl(): string {
    return this.config.getOrThrow<string>('frontend.url')
  }

  get mailerConfig() {
    return {
      host: this.config.getOrThrow<string>('smtp.host'),
      port: this.config.getOrThrow<string>('smtp.port'),
      secure: this.config.get<boolean>('smtp.secure') || false,
      auth: {
        user: this.config.getOrThrow<string>('smtp.user'),
        pass: this.config.getOrThrow<string>('smtp.pass'),
      },
    }
  }

  get twilio() {
    return {
      accountSid: this.config.get('twilio.accountSid'),
      authToken: this.config.get('twilio.authToken'),
      fromNumber: this.config.get('twilio.fromNumber'),
    }
  }

  get stripe() {
    return {
      secretKey: this.config.get<string>('STRIPE_SECRET_KEY') || '',
      publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY') || '',
      webhookSecret: this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '',
      currency: this.config.get<string>('STRIPE_CURRENCY') || 'usd',
    }
  }

}
