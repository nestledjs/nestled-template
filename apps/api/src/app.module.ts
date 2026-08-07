import { ApiGeneratedCrudFeatureModule } from '@nestled-template/api/generated-crud/feature'
import { ApiAdminCustomModule } from '@nestled-template/api/admin-custom'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import {
  AdminModule,
  ApiTokenAuthMiddleware,
  ApiTokensModule,
  AuthModule,
  BillingModule,
  ContactMailerModule,
  McpController,
  McpModule,
  OrganizationModule,
  PlanModule,
  SecurityEventsModule,
  StoragePluginModule,
  SubscriptionModule,
  TenancyMiddleware,
  TenancyModule,
  UserPreferenceModule,
} from '@nestled-template/api/custom'
import { StripeModule } from '@nestled-template/api/integrations'
import { GlobalAuthGuard, GuardsModule } from '@nestled-template/api/utils'
import { ApiCoreFeatureModule } from '@nestled-template/api/core/feature'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { LoggerMiddleware } from './applogger.middleware'
import { ConfigModule } from '@nestjs/config'
import {
  ConfigModule as ApiConfigModule,
  configuration,
  validationSchema,
} from '@nestled-template/api/config'
import { StripeWebhookController } from './webhooks/stripe-webhook.controller'

// Generated and framework infrastructure modules.
export const coreModules = [
  ApiCoreFeatureModule,
  GuardsModule,
  ApiCoreDataAccessModule,
  ApiGeneratedCrudFeatureModule,
]
// Admin-only custom workflows that intentionally compose generated CRUD.
export const adminModules = [ApiAdminCustomModule]
// Explicit model-adjacent application extensions.
export const defaultModules = [
  // Explicit model-adjacent extensions. Generated CRUD is registered by
  // ApiGeneratedCrudFeatureModule and does not depend on these modules.
  OrganizationModule,
  UserPreferenceModule,
  PlanModule,
  SubscriptionModule,
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
export const appModules = [...coreModules, ...adminModules, ...defaultModules, ...pluginModules]

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
