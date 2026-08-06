import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { Authenticated, CtxUser, GqlAuthGuard } from '@nestled-template/api/utils'
import { Subscription, User } from '@nestled-template/api/core/models'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { StripeService } from '@nestled-template/api/integrations'
import { ConfigService } from '@nestled-template/api/config'
import { UsageService } from '../../plugins/billing/usage.service'
import { recordBillingAuditLog } from '../../plugins/billing/audit-log'

/**
 * User Subscription Resolver
 *
 * Provides user-facing queries and mutations for managing subscriptions.
 * This is separate from the generated admin Subscription resolver.
 */
@Authenticated()
@Resolver(() => Subscription)
@UseGuards(GqlAuthGuard)
export class UserSubscriptionResolver {
  constructor(
    private readonly prisma: ApiCoreDataAccessService,
    private readonly stripe: StripeService,
    private readonly usage: UsageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Get current user's organization subscription
   */
  @Query(() => Subscription, { nullable: true })
  async currentSubscription(@CtxUser() user: User): Promise<Subscription | null> {
    if (!user.activeOrganizationId) {
      return null
    }

    return this.prisma.subscription.findUnique({
      where: { organizationId: user.activeOrganizationId },
      include: { plan: true },
    })
  }

  /**
   * Create a Stripe Checkout session to subscribe to a plan
   */
  @Mutation(() => String)
  async createCheckoutSession(
    @Args('priceId') priceId: string,
    @CtxUser() user: User,
  ): Promise<string> {
    if (!user.activeOrganizationId) {
      throw new Error('No active organization selected')
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: user.activeOrganizationId },
      include: {
        emails: { where: { primary: true } },
        subscription: true,
      },
    })

    if (!organization) {
      throw new Error('Organization not found')
    }

    // Get or create Stripe customer
    let customerId = organization.subscription?.stripeCustomerId

    if (!customerId) {
      const customer = await this.stripe.createCustomer({
        email: organization.emails?.[0]?.email ?? user.emails?.[0]?.email ?? 'unknown@example.com',
        name: organization.name,
        metadata: {
          organizationId: organization.id,
        },
      })
      customerId = customer.id
    }

    // Get the plan for metadata
    const plan = await this.prisma.plan.findUnique({
      where: { stripePriceId: priceId },
    })

    const siteUrl = this.config.siteUrl

    // Create checkout session
    const session = await this.stripe.createCheckoutSession({
      priceId,
      customerId,
      successUrl: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/checkout/cancel`,
      trialPeriodDays: plan?.trialPeriodDays || undefined,
      metadata: {
        organizationId: organization.id,
        planId: plan?.id || '',
      },
    })

    await recordBillingAuditLog(this.prisma, {
      actorUserId: user.id,
      organizationId: organization.id,
      entityId: organization.id,
      entityType: 'Organization',
      action: 'BILLING_CHECKOUT_SESSION_CREATED',
      changes: {
        priceId,
        planId: plan?.id ?? null,
        checkoutSessionId: session.id ?? null,
      },
    })

    return session.url || ''
  }

  /**
   * Create a Stripe Billing Portal session to manage subscription
   */
  @Mutation(() => String)
  async createPortalSession(@CtxUser() user: User): Promise<string> {
    if (!user.activeOrganizationId) {
      throw new Error('No active organization selected')
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: user.activeOrganizationId },
    })

    if (!subscription?.stripeCustomerId) {
      throw new Error('No active subscription found')
    }

    const siteUrl = this.config.siteUrl

    const session = await this.stripe.createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${siteUrl}/settings/billing`,
    })

    await recordBillingAuditLog(this.prisma, {
      actorUserId: user.id,
      organizationId: user.activeOrganizationId,
      entityId: subscription.id,
      entityType: 'Subscription',
      action: 'BILLING_PORTAL_SESSION_CREATED',
      changes: {
        portalSessionId: session.id ?? null,
      },
    })

    return session.url
  }

  /**
   * Cancel subscription (at end of billing period)
   */
  @Mutation(() => Subscription)
  async cancelSubscription(@CtxUser() user: User): Promise<Subscription> {
    if (!user.activeOrganizationId) {
      throw new Error('No active organization selected')
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: user.activeOrganizationId },
    })

    if (!subscription?.stripeSubscriptionId) {
      throw new Error('No active subscription found')
    }

    // Cancel at end of period (not immediately)
    await this.stripe.cancelSubscription(subscription.stripeSubscriptionId, false)

    // Update local record
    const updatedSubscription = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
      },
    })

    await recordBillingAuditLog(this.prisma, {
      actorUserId: user.id,
      organizationId: user.activeOrganizationId,
      entityId: subscription.id,
      entityType: 'Subscription',
      action: 'SUBSCRIPTION_CANCEL_AT_PERIOD_END',
      changes: {
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
    })

    return updatedSubscription
  }

  /**
   * Get usage data for current organization
   */
  @Query(() => String)
  async currentUsage(@CtxUser() user: User): Promise<string> {
    if (!user.activeOrganizationId) {
      throw new Error('No active organization selected')
    }

    const usageData = await this.usage.getUsageWithLimits(user.activeOrganizationId)
    return JSON.stringify(usageData)
  }
}
