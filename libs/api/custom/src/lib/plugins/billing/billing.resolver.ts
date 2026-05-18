import { Resolver, Mutation, Args } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'
import { SyncService } from './sync.service'
import { StripeService } from '@nestled-template/api/integrations'

/**
 * Billing Resolver
 *
 * Provides admin mutations for managing billing infrastructure.
 * All operations require super admin permissions.
 */
@Resolver()
@UseGuards(GqlAuthAdminGuard)
export class BillingResolver {
  constructor(
    private readonly syncService: SyncService,
    private readonly stripe: StripeService,
  ) {}

  @Mutation(() => Boolean)
  async syncStripeProducts(): Promise<boolean> {
    await this.syncService.syncAllProducts()
    return true
  }

  @Mutation(() => Boolean)
  async syncStripePrices(): Promise<boolean> {
    await this.syncService.syncAllPrices()
    return true
  }

  @Mutation(() => Boolean)
  async syncStripeProduct(@Args('productId') productId: string): Promise<boolean> {
    await this.syncService.syncProductFromStripe(productId)
    return true
  }

  @Mutation(() => Boolean)
  async syncStripePrice(@Args('priceId') priceId: string): Promise<boolean> {
    await this.syncService.syncPriceFromStripe(priceId)
    return true
  }

  @Mutation(() => Boolean)
  async syncStripeSubscription(@Args('subscriptionId') subscriptionId: string): Promise<boolean> {
    await this.syncService.syncSubscriptionFromStripe(subscriptionId)
    return true
  }
}
