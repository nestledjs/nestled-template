import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import {
  AddressModule,
  AdminModule,
  ApiTokenModule,
  ApiTokenAuthMiddleware,
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
  McpController,
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
} from '@nestled-template/api/custom'
import { StripeModule } from '@nestled-template/api/integrations'
import { GuardsModule } from '@nestled-template/api/utils'
import { ApiCoreFeatureModule } from '@nestled-template/api/core/feature'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ViewerContextInterceptor } from '@nestled-template/api/core/helpers'
import { GlobalAuthGuard } from '@nestled-template/api/utils'
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
  providers: [
    // Fail-closed default. NestJS applies no guard unless one is asked for, so without this an
    // operation that forgets `@UseGuards` is reachable anonymously. Refuses anything that has not
    // declared an access level; the declared guards still perform the actual check.
    { provide: APP_GUARD, useClass: GlobalAuthGuard },
    // Publishes the authenticated user for the duration of each request so the nested-select
    // builder can authorize relation traversal. Interceptors run after guards, so req.user is
    // already populated. Registered globally because generated resolvers cannot be edited.
    { provide: APP_INTERCEPTOR, useClass: ViewerContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply logging middleware to all routes
    consumer.apply(LoggerMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL })

    // Apply API token auth middleware to MCP routes.
    consumer.apply(ApiTokenAuthMiddleware).forRoutes(McpController)

    // Apply tenancy middleware to GraphQL endpoint (runs after authentication)
    consumer.apply(TenancyMiddleware).forRoutes({ path: 'graphql', method: RequestMethod.ALL })
  }
}
