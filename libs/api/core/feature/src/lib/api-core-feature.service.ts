import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CookieOptions } from 'express'

@Injectable()
export class ApiCoreFeatureService {
  constructor(public readonly config: ConfigService) {}

  uptime(): number {
    return process.uptime()
  }

  get apiUrl(): string {
    return this.config.getOrThrow<string>('apiUrl')
  }

  get apiCorsOrigins(): string[] {
    return this.config.get<string[]>('api.cors.origin') ?? []
  }

  get cookie(): { name: string; options: CookieOptions } {
    return this.config.getOrThrow<{ name: string; options: CookieOptions }>('api.cookie')
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

  get mailerConfig() {
    return {
      host: this.config.getOrThrow<string>('smtp.host'),
      port: this.config.getOrThrow<string>('smtp.port'),
      auth: {
        user: this.config.getOrThrow<string>('smtp.user'),
        pass: this.config.getOrThrow<string>('smtp.pass'),
      },
    }
  }
}
