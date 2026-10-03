import { Module, Global } from '@nestjs/common'
import { StripeService } from './stripe.service'

/**
 * Stripe Integration Module
 *
 * Provides Stripe service globally throughout the application.
 * Import this module in your app.module.ts to enable Stripe billing.
 */
@Global()
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
