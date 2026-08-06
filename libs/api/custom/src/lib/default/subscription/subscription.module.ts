import { Module } from '@nestjs/common'
import { UserSubscriptionResolver } from './user-subscription.resolver'
import { StripeModule } from '@nestled-template/api/integrations'
import { BillingModule } from '../../plugins/billing'

@Module({
  imports: [StripeModule, BillingModule],
  providers: [UserSubscriptionResolver],
  exports: [UserSubscriptionResolver],
})
export class SubscriptionModule {}
