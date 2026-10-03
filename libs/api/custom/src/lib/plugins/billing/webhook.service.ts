import { Injectable, Logger } from '@nestjs/common'
import { SubscriptionStatus } from '@nestled-template/api/prisma'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import type { Stripe } from 'stripe/cjs/stripe.core'

/**
 * Convert a Stripe unix-seconds timestamp to a Date, or undefined when the value is absent/invalid.
 * Guards against `new Date(undefined * 1000)` (Invalid Date), which Prisma rejects.
 */
function toDateFromUnix(seconds: unknown): Date | undefined {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : undefined
}

// The pinned Stripe types lag the runtime API, so a few fields (basil+) that moved location aren't
// on the compile-time types. Rather than reach for `any`, read them off a structural record view.
function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function numberField(source: unknown, key: string): number | undefined {
  const value = toRecord(source)[key]
  return typeof value === 'number' ? value : undefined
}

function booleanField(source: unknown, key: string): boolean | undefined {
  const value = toRecord(source)[key]
  return typeof value === 'boolean' ? value : undefined
}

/** Resolve a Stripe `string | { id }` reference field to its id string. */
function refToId(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined
  const id = toRecord(value)['id']
  return typeof id === 'string' && id ? id : undefined
}

/**
 * Stripe Webhook Handler Service
 *
 * Processes Stripe webhook events and syncs data to the database.
 * Each handler method is idempotent and can be safely retried.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name)
  private readonly processedEvents = new Set<string>()

  constructor(private readonly prisma: ApiCoreDataAccessService) {}

  /**
   * Main webhook event dispatcher
   * Routes events to appropriate handlers based on event type
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    // Check for duplicate events (idempotency)
    if (this.processedEvents.has(event.id)) {
      this.logger.log(`Skipping duplicate event: ${event.id}`)
      return
    }

    this.logger.log(`Processing webhook event: ${event.type} (${event.id})`)

    try {
      switch (event.type) {
        // Checkout Session Events
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object)
          break

        // Subscription Events
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object)
          break

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object)
          break

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object)
          break

        // Invoice Events
        case 'invoice.paid':
          await this.handleInvoicePaid(event.data.object)
          break

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object)
          break

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object)
          break

        case 'invoice.upcoming':
          await this.handleInvoiceUpcoming(event.data.object)
          break

        // Payment Intent Events (One-time payments)
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object)
          break

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object)
          break

        // Charge Events
        case 'charge.succeeded':
          await this.handleChargeSucceeded(event.data.object)
          break

        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object)
          break

        // Product/Price Events
        case 'product.created':
        case 'product.updated':
          await this.handleProductUpdated(event.data.object)
          break

        case 'price.created':
        case 'price.updated':
          await this.handlePriceUpdated(event.data.object)
          break

        // Customer Events
        case 'customer.created':
        case 'customer.updated':
          await this.handleCustomerUpdated(event.data.object)
          break

        case 'customer.deleted':
          await this.handleCustomerDeleted(event.data.object)
          break

        default:
          this.logger.log(`Unhandled event type: ${event.type}`)
      }

      // Mark event as processed
      this.processedEvents.add(event.id)

      // Clean up old processed events (keep last 10000)
      if (this.processedEvents.size > 10000) {
        const eventsArray = Array.from(this.processedEvents)
        this.processedEvents.clear()
        eventsArray.slice(-5000).forEach(id => this.processedEvents.add(id))
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      this.logger.error(`Error processing webhook event ${event.id}: ${errorMessage}`, errorStack)
      throw error
    }
  }

  // ============================================================================
  // CHECKOUT SESSION HANDLERS
  // ============================================================================

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    this.logger.log(`Checkout session completed: ${session.id}`)

    const { customer, subscription, metadata } = session
    const organizationId = metadata?.['organizationId']

    if (!organizationId) {
      this.logger.error(`No organizationId in checkout session metadata: ${session.id}`)
      return
    }

    if (!customer || !subscription) {
      this.logger.error(`Missing customer or subscription in checkout session: ${session.id}`)
      return
    }

    const customerId = typeof customer === 'string' ? customer : customer.id
    const subscriptionId = typeof subscription === 'string' ? subscription : subscription.id

    // Resolve the Plan FK BEFORE writing. `planId` is a required, FK-constrained column, so writing
    // an empty string (the old `metadata.planId || ''` default) — or a stale/typo'd id — is
    // guaranteed to throw a raw Prisma P2003. resolveCheckoutPlanId only returns ids confirmed to
    // exist, so the FK write is safe.
    const resolvedPlanId = await this.resolveCheckoutPlanId(session, metadata)

    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { id: true, planId: true },
    })

    // On create we MUST have a plan. On update, fall back to the existing row's (already valid) FK
    // so a webhook that can't re-resolve the plan never clobbers it with null. Derive a genuinely
    // non-null value here so the create write needs no unsafe `as string` cast.
    const planIdForWrite = resolvedPlanId ?? existing?.planId ?? null

    if (!planIdForWrite) {
      // Deliberately NON-FATAL (return 200, not throw): a genuinely unmappable price would otherwise
      // make Stripe retry this event forever. But a paid checkout with no local Plan must NOT be
      // silent — surface it loudly so it can be reconciled. (A production deployment should wire a
      // real alert/on-call hook here.)
      this.logger.error(
        `ALERT: checkout ${session.id} completed for organization ${organizationId} but no Plan ` +
          `resolved (metadata.planId / metadata.priceId matched no Plan row). No Subscription ` +
          `written — manual reconciliation required.`,
      )
      return
    }

    await this.prisma.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        planId: planIdForWrite,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: SubscriptionStatus.ACTIVE,
      },
      update: {
        planId: planIdForWrite,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: SubscriptionStatus.ACTIVE,
      },
    })

    this.logger.log(
      `Subscription ${existing ? 'updated' : 'created'} for organization: ${organizationId}`,
    )
  }

  /**
   * Resolve the local Plan id for a completed checkout session.
   *
   * Prefers the explicit `planId` in session metadata, but only after confirming a matching Plan
   * row exists — an unknown id (stale/typo'd) is treated as unresolved rather than passed straight
   * through to an FK write that would throw P2003. Falls back to looking up a Plan by the Stripe
   * price id (from metadata) so a checkout for a price present in the Plan table still resolves even
   * when the caller forgot to set `planId`. Returns null when nothing resolves — the caller decides
   * whether that is fatal.
   */
  private async resolveCheckoutPlanId(
    session: Stripe.Checkout.Session,
    metadata: Stripe.Metadata | null | undefined,
  ): Promise<string | null> {
    const metadataPlanId = metadata?.['planId']?.trim()
    if (metadataPlanId) {
      const plan = await this.prisma.plan.findUnique({
        where: { id: metadataPlanId },
        select: { id: true },
      })
      if (plan) {
        return plan.id
      }
      this.logger.warn(
        `Checkout session ${session.id} metadata.planId ${metadataPlanId} matches no Plan row — ` +
          `ignoring and trying the Stripe price id`,
      )
    }

    const stripePriceId = metadata?.['priceId']?.trim() || metadata?.['stripePriceId']?.trim()
    if (stripePriceId) {
      const plan = await this.prisma.plan.findUnique({
        where: { stripePriceId },
        select: { id: true },
      })
      if (plan) {
        return plan.id
      }
      this.logger.warn(
        `Checkout session ${session.id} referenced Stripe price ${stripePriceId} with no matching Plan row`,
      )
    }

    return null
  }

  // ============================================================================
  // SUBSCRIPTION HANDLERS
  // ============================================================================

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription created: ${subscription.id}`)
    await this.syncSubscriptionToDatabase(subscription)
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id}`)
    await this.syncSubscriptionToDatabase(subscription)
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`)

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
    })
  }

  /**
   * Sync Stripe subscription to database
   */
  private async syncSubscriptionToDatabase(stripeSubscription: Stripe.Subscription): Promise<void> {
    const status = this.mapStripeStatusToPrisma(stripeSubscription.status)

    // `current_period_end` moved off the top-level Subscription object (basil+ API) onto each
    // subscription item (`items.data[].current_period_end`). Read the item value first, fall back
    // to the legacy top-level for older API versions, and GUARD the conversion: an unconditional
    // `new Date(undefined * 1000)` is an Invalid Date, which Prisma rejects — throwing on every
    // subscription webhook (silently, before the controller fix, since it acked first).
    const firstItem = stripeSubscription.items?.data?.[0]
    const currentPeriodEnd =
      numberField(firstItem, 'current_period_end') ??
      numberField(stripeSubscription, 'current_period_end')
    const trialStart = numberField(stripeSubscription, 'trial_start')
    const trialEnd = numberField(stripeSubscription, 'trial_end')
    const cancelAt = numberField(stripeSubscription, 'cancel_at')
    const canceledAt = numberField(stripeSubscription, 'canceled_at')
    const cancelAtPeriodEnd = booleanField(stripeSubscription, 'cancel_at_period_end')

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSubscription.id },
      data: {
        status,
        stripePriceId: stripeSubscription.items.data[0]?.price.id,
        stripeCurrentPeriodEnd: toDateFromUnix(currentPeriodEnd),
        trialStart: trialStart ? new Date(trialStart * 1000) : undefined,
        trialEnd: trialEnd ? new Date(trialEnd * 1000) : undefined,
        cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
        canceledAt: canceledAt ? new Date(canceledAt * 1000) : null,
        cancelAtPeriodEnd: cancelAtPeriodEnd ?? undefined,
      },
    })
  }

  /**
   * Resolve the Stripe subscription id from an invoice across API versions.
   *
   * On basil+ (stripe@18+/dahlia-era) `Invoice` no longer carries a top-level `subscription` field;
   * it moved under `invoice.parent.subscription_details.subscription` (and per-line
   * `parent.subscription_item_details.subscription`). The previous cast-based top-level
   * `subscription` read silently returned undefined there, so the whole update branch was skipped — failed
   * payments never moved a subscription to PAST_DUE and paid invoices never refreshed the period.
   */
  private resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
    const inv = toRecord(invoice)
    const parentSubDetails = toRecord(toRecord(inv['parent'])['subscription_details'])

    const lineData = toRecord(inv['lines'])['data']
    const firstLine = toRecord(Array.isArray(lineData) ? lineData[0] : undefined)
    const lineSubItemDetails = toRecord(toRecord(firstLine['parent'])['subscription_item_details'])

    const candidates: unknown[] = [
      inv['subscription'], // legacy top-level
      parentSubDetails['subscription'], // basil+ invoice.parent.subscription_details
      lineSubItemDetails['subscription'], // basil+ per-line
      firstLine['subscription'], // older per-line
    ]
    for (const candidate of candidates) {
      const id = refToId(candidate)
      if (id) return id
    }
    return undefined
  }

  /**
   * Map Stripe subscription status to Prisma enum
   */
  private mapStripeStatusToPrisma(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      canceled: SubscriptionStatus.CANCELED,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      past_due: SubscriptionStatus.PAST_DUE,
      trialing: SubscriptionStatus.TRIALING,
      unpaid: SubscriptionStatus.PAST_DUE,
      paused: SubscriptionStatus.PAST_DUE,
    }

    return statusMap[stripeStatus] || SubscriptionStatus.INCOMPLETE
  }

  // ============================================================================
  // INVOICE HANDLERS
  // ============================================================================

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice paid: ${invoice.id}`)

    const subscriptionId = this.resolveInvoiceSubscriptionId(invoice)
    if (subscriptionId) {
      await this.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          stripeCurrentPeriodEnd: toDateFromUnix(invoice.period_end),
        },
      })
    } else {
      this.logger.warn(`invoice.paid ${invoice.id} has no resolvable subscription id — skipping`)
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment succeeded: ${invoice.id}`)
    // Same as handleInvoicePaid
    await this.handleInvoicePaid(invoice)
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment failed: ${invoice.id}`)

    const subscriptionId = this.resolveInvoiceSubscriptionId(invoice)
    if (subscriptionId) {
      await this.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: SubscriptionStatus.PAST_DUE,
        },
      })
    } else {
      this.logger.warn(
        `invoice.payment_failed ${invoice.id} has no resolvable subscription id — skipping`,
      )
    }

    // FUTURE: Send payment failed email
    this.logger.warn(
      `Payment failed for invoice ${invoice.id} - consider sending email notification`,
    )
  }

  private async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice upcoming: ${invoice.id}`)
    // FUTURE: Send upcoming invoice email (7 days before billing)
    this.logger.log(`Upcoming invoice in 7 days - consider sending reminder email`)
  }

  // ============================================================================
  // PAYMENT INTENT HANDLERS (One-time payments)
  // ============================================================================

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`)

    // FUTURE: Create Payment record if you add the Payment model
    // For now, just log the successful payment
    this.logger.log(`One-time payment succeeded: ${paymentIntent.amount} ${paymentIntent.currency}`)
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.error(`Payment intent failed: ${paymentIntent.id}`)
    // FUTURE: Handle failed one-time payment
    // Send notification, log to database, etc.
  }

  // ============================================================================
  // CHARGE HANDLERS
  // ============================================================================

  private async handleChargeSucceeded(charge: Stripe.Charge): Promise<void> {
    this.logger.log(`Charge succeeded: ${charge.id}`)
    // Charges are typically handled via invoice/payment_intent events
    // This is a fallback handler for direct charge events
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    this.logger.log(`Charge refunded: ${charge.id}`)
    // FUTURE: Handle refund logic
    // Update payment records, revoke access if applicable, send confirmation email
  }

  // ============================================================================
  // PRODUCT/PRICE HANDLERS
  // ============================================================================

  private async handleProductUpdated(product: Stripe.Product): Promise<void> {
    this.logger.log(`Product updated: ${product.id}`)

    await this.prisma.plan.updateMany({
      where: { stripeProductId: product.id },
      data: {
        name: product.name,
        description: product.description || undefined,
        active: product.active,
      },
    })
  }

  private async handlePriceUpdated(price: Stripe.Price): Promise<void> {
    this.logger.log(`Price updated: ${price.id}`)

    await this.prisma.plan.updateMany({
      where: { stripePriceId: price.id },
      data: {
        active: price.active,
      },
    })
  }

  // ============================================================================
  // CUSTOMER HANDLERS
  // ============================================================================

  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    this.logger.log(`Customer updated: ${customer.id}`)
    // Customer data is primarily managed in Stripe
    // We just store the customer ID in the subscription record
    // No action needed here unless you want to sync customer email/name
  }

  private async handleCustomerDeleted(customer: Stripe.Customer): Promise<void> {
    this.logger.log(`Customer deleted: ${customer.id}`)

    // Optionally cancel all subscriptions for this customer
    await this.prisma.subscription.updateMany({
      where: { stripeCustomerId: customer.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
    })
  }
}
