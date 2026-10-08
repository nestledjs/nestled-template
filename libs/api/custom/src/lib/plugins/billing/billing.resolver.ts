import { Resolver, Mutation, Query, Args } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import {
  AdminOnly,
  CtxUser,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'
import { SyncService } from './sync.service'
import { Plan, Subscription, User } from '@nestled-template/api/core/models'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { recordAuditLog } from '../../shared/audit-log'
import {
  AdminBillingSubscriptionsInput,
  AdminBillingSubscriptionsResponse,
} from './admin-billing.dto'

/**
 * Billing Resolver
 *
 * The class authenticates super administrators with GqlAuthAdminGuard and declares AdminOnly.
 * Each operation adds its platform permission through the under-class-guard decorator, preserving
 * that admin declaration without authenticating again. These explicit billing APIs keep their
 * authorization independent of the generated CRUD surface.
 */
@AdminOnly()
@Resolver()
@UseGuards(GqlAuthAdminGuard)
export class BillingResolver {
  constructor(
    private readonly syncService: SyncService,
    private readonly data: ApiCoreDataAccessService,
  ) {}

  @Query(() => [Plan])
  @RequirePlatformPermissionUnderClassGuard('platform.billing.read')
  async adminBillingPlans(): Promise<Plan[]> {
    return this.data.plan.findMany({ orderBy: { createdAt: 'desc' } })
  }

  @Query(() => AdminBillingSubscriptionsResponse)
  @RequirePlatformPermissionUnderClassGuard('platform.billing.read')
  async adminBillingSubscriptions(
    @Args('input', { nullable: true }) input?: AdminBillingSubscriptionsInput,
  ): Promise<AdminBillingSubscriptionsResponse> {
    const skip = Math.max(0, input?.skip ?? 0)
    const take = Math.min(100, Math.max(1, input?.take ?? 50))
    const search = input?.search?.trim()
    const where = search
      ? { organization: { name: { contains: search, mode: 'insensitive' as const } } }
      : undefined

    const [subscriptions, total] = await Promise.all([
      this.data.subscription.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        // emails is selected by the admin Billing SDK document; without the nested include it
        // resolves to null rather than failing, so keep the two in step.
        include: { organization: { include: { emails: true } }, plan: true },
      }),
      this.data.subscription.count({ where }),
    ])

    return { subscriptions, total }
  }

  @Mutation(() => Boolean)
  @RequirePlatformPermissionUnderClassGuard('platform.billing.manage')
  async syncStripeProducts(@CtxUser() user: User): Promise<boolean> {
    const result = await this.syncService.syncAllProducts()
    await recordAuditLog(this.data, {
      actorUserId: user.id,
      entityId: 'stripe-products',
      entityType: 'StripeProduct',
      action: 'STRIPE_PRODUCTS_SYNCED',
      changes: result,
    })
    return true
  }

  @Mutation(() => Boolean)
  @RequirePlatformPermissionUnderClassGuard('platform.billing.manage')
  async syncStripePrices(@CtxUser() user: User): Promise<boolean> {
    const result = await this.syncService.syncAllPrices()
    await recordAuditLog(this.data, {
      actorUserId: user.id,
      entityId: 'stripe-prices',
      entityType: 'StripePrice',
      action: 'STRIPE_PRICES_SYNCED',
      changes: result,
    })
    return true
  }

  @Mutation(() => Boolean)
  @RequirePlatformPermissionUnderClassGuard('platform.billing.manage')
  async syncStripeProduct(
    @Args('productId') productId: string,
    @CtxUser() user: User,
  ): Promise<boolean> {
    await this.syncService.syncProductFromStripe(productId)
    await recordAuditLog(this.data, {
      actorUserId: user.id,
      entityId: productId,
      entityType: 'StripeProduct',
      action: 'STRIPE_PRODUCT_SYNCED',
      changes: { productId },
    })
    return true
  }

  @Mutation(() => Boolean)
  @RequirePlatformPermissionUnderClassGuard('platform.billing.manage')
  async syncStripePrice(@Args('priceId') priceId: string, @CtxUser() user: User): Promise<boolean> {
    await this.syncService.syncPriceFromStripe(priceId)
    await recordAuditLog(this.data, {
      actorUserId: user.id,
      entityId: priceId,
      entityType: 'StripePrice',
      action: 'STRIPE_PRICE_SYNCED',
      changes: { priceId },
    })
    return true
  }

  @Mutation(() => Boolean)
  @RequirePlatformPermissionUnderClassGuard('platform.billing.manage')
  async syncStripeSubscription(
    @Args('subscriptionId') subscriptionId: string,
    @CtxUser() user: User,
  ): Promise<boolean> {
    await this.syncService.syncSubscriptionFromStripe(subscriptionId)
    await recordAuditLog(this.data, {
      actorUserId: user.id,
      entityId: subscriptionId,
      entityType: 'StripeSubscription',
      action: 'STRIPE_SUBSCRIPTION_SYNCED',
      changes: { subscriptionId },
    })
    return true
  }
}
