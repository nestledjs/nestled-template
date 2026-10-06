import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import {
  Authenticated,
  CtxOrganizationId,
  CtxUser,
  GqlOrganizationScopedGuard,
  RequireOrganizationPermission,
} from '@nestled-template/api/utils'
import { Subscription, User } from '@nestled-template/api/core/models'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { StripeService } from '@nestled-template/api/integrations'
import { ConfigService } from '@nestled-template/api/config'
import { UsageService } from '../../plugins/billing/usage.service'
import { recordAuditLog } from '../../shared/audit-log'

/**
 * User Subscription Resolver
 *
 * Provides user-facing queries and mutations for managing subscriptions.
 * This is separate from the generated admin Subscription resolver.
 *
 * Every operation acts on the request's organization context: the organization the caller's
 * membership was checked against (x-organization-id or their active organization), never the raw
 * `user.activeOrganizationId`. Reads need `billing:read` (or `billing:manage`) there; changes need
 * `billing:manage`. The one exception is `currentSubscriptionActive`, which any member may read.
 */
@Resolver(() => Subscription)
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
  @RequireOrganizationPermission(['billing:read', 'billing:manage'])
  async currentSubscription(
    @CtxOrganizationId() organizationId: string,
  ): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })
  }

  /**
   * Whether the organization's subscription currently grants access (ACTIVE or TRIALING).
   *
   * Any member may ask, so that member-facing UI can gate on an active subscription without the
   * billing details `currentSubscription` holds. It answers for the organization the caller's
   * membership was checked against, and says nothing else about the subscription.
   */
  @Query(() => Boolean)
  @UseGuards(GqlOrganizationScopedGuard)
  @Authenticated()
  async currentSubscriptionActive(@CtxOrganizationId() organizationId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { status: true },
    })
    return subscription?.status === 'ACTIVE' || subscription?.status === 'TRIALING'
  }

  /**
   * Create a Stripe Checkout session to subscribe to a plan
   */
  @Mutation(() => String)
  @RequireOrganizationPermission(['billing:manage'])
  async createCheckoutSession(
    @Args('priceId') priceId: string,
    @CtxUser() user: User,
    @CtxOrganizationId() organizationId: string,
  ): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
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

    await recordAuditLog(this.prisma, {
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
  @RequireOrganizationPermission(['billing:manage'])
  async createPortalSession(
    @CtxUser() user: User,
    @CtxOrganizationId() organizationId: string,
  ): Promise<string> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
    })

    if (!subscription?.stripeCustomerId) {
      throw new Error('No active subscription found')
    }

    const siteUrl = this.config.siteUrl

    const session = await this.stripe.createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${siteUrl}/settings/billing`,
    })

    await recordAuditLog(this.prisma, {
      actorUserId: user.id,
      organizationId,
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
  @RequireOrganizationPermission(['billing:manage'])
  async cancelSubscription(
    @CtxUser() user: User,
    @CtxOrganizationId() organizationId: string,
  ): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
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

    await recordAuditLog(this.prisma, {
      actorUserId: user.id,
      organizationId,
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
  @RequireOrganizationPermission(['billing:read', 'billing:manage'])
  async currentUsage(@CtxOrganizationId() organizationId: string): Promise<string> {
    const usageData = await this.usage.getUsageWithLimits(organizationId)
    return JSON.stringify(usageData)
  }
}
