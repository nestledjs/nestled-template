import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { ApiCoreFeatureModule } from '@nestled-template/api/core/feature'
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
import { ConfigModule } from '@nestled-template/api/config'
import { SecurityEventsModule } from '../security'

@Module({
  imports: [
    ApiCoreDataAccessModule,
    ApiCoreFeatureModule,
    EmailIntegrationModule,
    ConfigModule,
    SecurityEventsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'],
    }),
  ],
  exports: [AuthService, OAuthService, SessionService],
  providers: [AuthService, SessionService, OAuthService, AuthResolver, UserExtensionResolver, JwtStrategy],
  controllers: [OAuthController],
})
export class AuthModule {}
