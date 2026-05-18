import { Module } from '@nestjs/common'
import { SubscriptionService } from './subscription.service'
import { SubscriptionResolver } from './subscription.resolver'
import { UserSubscriptionResolver } from './user-subscription.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'
import { StripeModule } from '@nestled-template/api/integrations'
import { BillingModule } from '../../plugins/billing'

@Module({
  imports: [ApiCrudDataAccessModule, StripeModule, BillingModule],
  providers: [SubscriptionService, SubscriptionResolver, UserSubscriptionResolver],
  exports: [SubscriptionService, SubscriptionResolver, UserSubscriptionResolver],
})
export class SubscriptionModule {}
