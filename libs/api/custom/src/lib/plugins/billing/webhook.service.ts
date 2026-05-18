import { Injectable, Logger } from '@nestjs/common'
import { SubscriptionStatus } from '@nestled-template/api/prisma'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import type { Stripe } from 'stripe/cjs/stripe.core'

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

    // Update or create subscription record
    await this.prisma.subscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        planId: metadata?.['planId'] || '', // This should be set from the checkout metadata
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: SubscriptionStatus.ACTIVE,
      },
      update: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: SubscriptionStatus.ACTIVE,
      },
    })

    this.logger.log(`Subscription created for organization: ${organizationId}`)
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

    // Extract properties to avoid type confusion
    const currentPeriodEnd = (stripeSubscription as any).current_period_end
    const trialStart = (stripeSubscription as any).trial_start
    const trialEnd = (stripeSubscription as any).trial_end
    const cancelAt = (stripeSubscription as any).cancel_at
    const canceledAt = (stripeSubscription as any).canceled_at
    const cancelAtPeriodEnd = (stripeSubscription as any).cancel_at_period_end

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSubscription.id },
      data: {
        status,
        stripePriceId: stripeSubscription.items.data[0]?.price.id,
        stripeCurrentPeriodEnd: new Date(currentPeriodEnd * 1000),
        trialStart: trialStart ? new Date(trialStart * 1000) : undefined,
        trialEnd: trialEnd ? new Date(trialEnd * 1000) : undefined,
        cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
        canceledAt: canceledAt ? new Date(canceledAt * 1000) : null,
        cancelAtPeriodEnd: cancelAtPeriodEnd,
      },
    })
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

    const subscriptionField = (invoice as any).subscription
    if (subscriptionField) {
      const subscriptionId =
        typeof subscriptionField === 'string' ? subscriptionField : subscriptionField.id

      await this.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          stripeCurrentPeriodEnd: invoice.period_end
            ? new Date(invoice.period_end * 1000)
            : undefined,
        },
      })
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment succeeded: ${invoice.id}`)
    // Same as handleInvoicePaid
    await this.handleInvoicePaid(invoice)
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment failed: ${invoice.id}`)

    const subscriptionField = (invoice as any).subscription
    if (subscriptionField) {
      const subscriptionId =
        typeof subscriptionField === 'string' ? subscriptionField : subscriptionField.id

      await this.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status: SubscriptionStatus.PAST_DUE,
        },
      })
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
