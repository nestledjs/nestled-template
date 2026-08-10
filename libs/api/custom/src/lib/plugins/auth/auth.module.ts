import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { AuthResolver } from './auth.resolver'
import { UserExtensionResolver } from './user-extension.resolver'
import { OAuthService } from './oauth.service'
import { OAuthController } from './oauth.controller'
import { EmailIntegrationModule } from '@nestled-template/api/integrations'
import { SecurityEventsModule } from '../security'
import { ApiTokensModule } from '../api-tokens/api-tokens.module'
import { EmailHygieneService, TurnstileService } from './signup-protection'
import { ThrottlerModule } from '@nestjs/throttler'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PlatformAccessControlModule } from '../access-control'

@Module({
  imports: [
    ApiCoreDataAccessModule,
    EmailIntegrationModule,
    SecurityEventsModule,
    ApiTokensModule,
    PlatformAccessControlModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'],
    }),
    // A single named throttler, applied only where GqlThrottlerGuard is declared (register,
    // resendVerificationEmail, and forgotPassword). Note for downstream: adding more throttlers
    // here applies them to those mutations too, since the guard evaluates every configured throttler.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const throttle = config.getOrThrow<{ enabled: boolean; ttlSeconds: number; limit: number }>(
          'signupProtection.throttle',
        )
        return {
          throttlers: [
            {
              name: 'signup',
              ttl: throttle.ttlSeconds * 1000, // config is seconds; throttler wants milliseconds
              limit: throttle.limit,
            },
          ],
          skipIf: () => !throttle.enabled,
        }
      },
    }),
  ],
  exports: [AuthService, OAuthService, SessionService],
  providers: [
    AuthService,
    SessionService,
    OAuthService,
    AuthResolver,
    UserExtensionResolver,
    JwtStrategy,
    TurnstileService,
    EmailHygieneService,
  ],
  controllers: [OAuthController],
})
export class AuthModule {}
