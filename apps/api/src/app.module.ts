import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import {
  AddressModule,
  AdminModule,
  ApiTokenModule,
  ApiTokensModule,
  AuditLogModule,
  AuthModule,
  BillingModule,
  ContactMailerModule,
  CountryModule,
  EmailModule,
  InviteModule,
  LinkModule,
  LoginAttemptModule,
  McpModule,
  OAuthAccountModule,
  OrganizationMemberModule,
  OrganizationModule,
  PermissionModule,
  PhoneNumberModule,
  PlanModule,
  RoleModule,
  SecurityEventModule,
  SecurityEventsModule,
  StoragePluginModule,
  StoredFileModule,
  SubscriptionModule,
  TeamMemberModule,
  TeamModule,
  TenancyMiddleware,
  TenancyModule,
  UserModule,
  UserPreferenceModule,
  UserSessionModule,
  PasswordHistoryModule,
} from '@nestled-template/api/custom'
import { StripeModule } from '@nestled-template/api/integrations'
import { GuardsModule } from '@nestled-template/api/utils'
import { ApiCoreFeatureModule } from '@nestled-template/api/core/feature'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { LoggerMiddleware } from './applogger.middleware'
import { ConfigModule } from '@nestjs/config'
import {
  ConfigModule as ApiConfigModule,
  configuration,
  validationSchema,
} from '@nestled-template/api/config'
import { StripeWebhookController } from './webhooks/stripe-webhook.controller'

// Auto-generated modules with special functions,
export const coreModules = [
  // Auto-generated modules with special functions,
  ApiCoreFeatureModule,
  GuardsModule,
  ApiCoreDataAccessModule,
]
// Auto-generated modules for each data type/model,
export const defaultModules = [
  // Minimal generated modules aligned to current schema,
  UserModule,
  AddressModule,
  CountryModule,
  EmailModule,
  LinkModule,
  PhoneNumberModule,
  OrganizationModule,
  InviteModule,
  OrganizationMemberModule,
  UserSessionModule,
  AuditLogModule,
  UserPreferenceModule,
  TeamModule,
  TeamMemberModule,
  LoginAttemptModule,
  SecurityEventModule,
  ApiTokenModule,
  OAuthAccountModule,
  PermissionModule,
  PlanModule,
  RoleModule,
  SubscriptionModule,
  StoredFileModule,
  PasswordHistoryModule,
]
// Manually maintained plugin modules (never overwritten by generator)
export const pluginModules = [
  // Manually maintained plugin modules (never overwritten by generator)
  AdminModule,
  AuthModule,
  ContactMailerModule,
  SecurityEventsModule,
  ApiTokensModule,
  StoragePluginModule,
  TenancyModule,
  StripeModule,
  BillingModule,
  McpModule,
]
// Combined modules used in the app
export const appModules = [...coreModules, ...defaultModules, ...pluginModules]

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      isGlobal: true,
    }),
    ApiConfigModule,
    ...appModules,
  ],
  controllers: [StripeWebhookController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply logging middleware to all routes
    consumer.apply(LoggerMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL })

    // Apply tenancy middleware to GraphQL endpoint (runs after authentication)
    consumer.apply(TenancyMiddleware).forRoutes({ path: 'graphql', method: RequestMethod.ALL })
  }
}
