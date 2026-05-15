import { Module, Global } from '@nestjs/common'
import { ConfigModule } from '@nestled-template/api/config'
import { StripeService } from './stripe.service'

/**
 * Stripe Integration Module
 *
 * Provides Stripe service globally throughout the application.
 * Import this module in your app.module.ts to enable Stripe billing.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
