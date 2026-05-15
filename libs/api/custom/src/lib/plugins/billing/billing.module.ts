import { Module } from '@nestjs/common'
import { StripeModule } from '@nestled-template/api/integrations'
import { BillingResolver } from './billing.resolver'
import { WebhookService } from './webhook.service'
import { SyncService } from './sync.service'
import { UsageService } from './usage.service'

/**
 * Billing Module
 *
 * Provides Stripe billing integration including:
 * - Webhook handling
 * - Data synchronization
 * - Usage tracking
 * - Admin billing operations
 */
@Module({
  imports: [StripeModule],
  providers: [BillingResolver, WebhookService, SyncService, UsageService],
  exports: [WebhookService, SyncService, UsageService],
})
export class BillingModule {}
