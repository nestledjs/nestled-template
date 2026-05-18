import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestled-template/api/config'
import StripeLib from 'stripe'
import type { Stripe } from 'stripe/cjs/stripe.core'

/**
 * Stripe Integration Service
 *
 * Provides a NestJS-injectable service for interacting with Stripe API.
 * This service wraps all Stripe operations with error handling, logging, and retry logic.
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name)
  private stripe!: Stripe

  constructor(private readonly configService: ConfigService) {}

  /**
   * Helper method to safely extract error message from unknown error type
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error'
  }

  onModuleInit() {
    const { secretKey } = this.configService.stripe

    const isPlaceholder =
      !secretKey ||
      secretKey.includes('your_key') ||
      secretKey === 'sk_test_...' ||
      secretKey === 'sk_live_...'
    if (isPlaceholder) {
      this.logger.warn('STRIPE_SECRET_KEY is not configured. Billing features will not work.')
      return // Gracefully handle missing or placeholder configuration
    }

    if (!secretKey.startsWith('sk_')) {
      this.logger.warn(
        'STRIPE_SECRET_KEY does not start with "sk_" - is this a valid Stripe secret key?',
      )
    }

    const isTestMode = secretKey.includes('_test_')
    this.logger.log(`Initializing Stripe client in ${isTestMode ? 'TEST' : 'LIVE'} mode`)

    this.stripe = new StripeLib(secretKey, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30000,
      telemetry: true,
      appInfo: {
        name: 'nestled-template',
        version: '1.0.0',
      },
    })
  }

  /**
   * Check if Stripe is properly configured
   */
  private ensureStripeConfigured(): void {
    if (!this.stripe) {
      throw new Error(
        'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.',
      )
    }
  }

  /**
   * Get the raw Stripe client instance
   * Use this sparingly - prefer specific methods below
   */
  getClient(): Stripe {
    this.ensureStripeConfigured()
    return this.stripe
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  async createProduct(params: {
    name: string
    description?: string
    metadata?: Stripe.MetadataParam
  }): Promise<Stripe.Product> {
    this.ensureStripeConfigured()
    this.logger.log(`Creating Stripe product: ${params.name}`)
    try {
      return await this.stripe.products.create({
        name: params.name,
        description: params.description,
        metadata: params.metadata,
      })
    } catch (error) {
      this.logger.error(`Failed to create product: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async updateProduct(
    productId: string,
    params: {
      name?: string
      description?: string
      active?: boolean
      metadata?: Stripe.MetadataParam
    },
  ): Promise<Stripe.Product> {
    this.logger.log(`Updating Stripe product: ${productId}`)
    try {
      return await this.stripe.products.update(productId, params)
    } catch (error) {
      this.logger.error(`Failed to update product ${productId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async getProduct(productId: string): Promise<Stripe.Product> {
    try {
      return await this.stripe.products.retrieve(productId)
    } catch (error) {
      this.logger.error(`Failed to get product ${productId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async listProducts(params?: {
    active?: boolean
    limit?: number
  }): Promise<Stripe.ApiList<Stripe.Product>> {
    try {
      return await this.stripe.products.list(params)
    } catch (error) {
      this.logger.error(`Failed to list products: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async archiveProduct(productId: string): Promise<Stripe.Product> {
    this.logger.log(`Archiving Stripe product: ${productId}`)
    return this.updateProduct(productId, { active: false })
  }

  // ============================================================================
  // PRICES
  // ============================================================================

  async createPrice(params: {
    productId: string
    unitAmount: number
    currency?: string
    interval?: 'day' | 'week' | 'month' | 'year'
    intervalCount?: number
    trialPeriodDays?: number
    metadata?: Stripe.MetadataParam
  }): Promise<Stripe.Price> {
    this.logger.log(`Creating Stripe price for product: ${params.productId}`)
    try {
      const priceParams: Stripe.PriceCreateParams = {
        product: params.productId,
        unit_amount: params.unitAmount,
        currency: params.currency || this.configService.stripe.currency || 'usd',
        metadata: params.metadata,
      }

      // If interval is provided, it's a recurring price
      if (params.interval) {
        priceParams.recurring = {
          interval: params.interval,
          interval_count: params.intervalCount || 1,
          trial_period_days: params.trialPeriodDays,
        }
      }

      return await this.stripe.prices.create(priceParams)
    } catch (error) {
      this.logger.error(`Failed to create price: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async updatePrice(
    priceId: string,
    params: {
      active?: boolean
      metadata?: Stripe.MetadataParam
    },
  ): Promise<Stripe.Price> {
    this.logger.log(`Updating Stripe price: ${priceId}`)
    try {
      return await this.stripe.prices.update(priceId, params)
    } catch (error) {
      this.logger.error(`Failed to update price ${priceId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async getPrice(priceId: string): Promise<Stripe.Price> {
    try {
      return await this.stripe.prices.retrieve(priceId)
    } catch (error) {
      this.logger.error(`Failed to get price ${priceId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async listPrices(params?: {
    productId?: string
    active?: boolean
    limit?: number
  }): Promise<Stripe.ApiList<Stripe.Price>> {
    try {
      return await this.stripe.prices.list({
        product: params?.productId,
        active: params?.active,
        limit: params?.limit,
      })
    } catch (error) {
      this.logger.error(`Failed to list prices: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async archivePrice(priceId: string): Promise<Stripe.Price> {
    this.logger.log(`Archiving Stripe price: ${priceId}`)
    return this.updatePrice(priceId, { active: false })
  }

  // ============================================================================
  // CUSTOMERS
  // ============================================================================

  async createCustomer(params: {
    email: string
    name?: string
    metadata?: Stripe.MetadataParam
  }): Promise<Stripe.Customer> {
    this.ensureStripeConfigured()
    this.logger.log(`Creating Stripe customer: ${params.email}`)
    try {
      return await this.stripe.customers.create({
        email: params.email,
        name: params.name,
        metadata: params.metadata,
      })
    } catch (error) {
      this.logger.error(`Failed to create customer: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async updateCustomer(
    customerId: string,
    params: {
      email?: string
      name?: string
      metadata?: Stripe.MetadataParam
    },
  ): Promise<Stripe.Customer> {
    this.logger.log(`Updating Stripe customer: ${customerId}`)
    try {
      return await this.stripe.customers.update(customerId, params)
    } catch (error) {
      this.logger.error(`Failed to update customer ${customerId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    try {
      return await this.stripe.customers.retrieve(customerId)
    } catch (error) {
      this.logger.error(`Failed to get customer ${customerId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async deleteCustomer(customerId: string): Promise<Stripe.DeletedCustomer> {
    this.logger.log(`Deleting Stripe customer: ${customerId}`)
    try {
      return await this.stripe.customers.del(customerId)
    } catch (error) {
      this.logger.error(`Failed to delete customer ${customerId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  async createSubscription(params: {
    customerId: string
    priceId: string
    trialPeriodDays?: number
    metadata?: Stripe.MetadataParam
  }): Promise<Stripe.Subscription> {
    this.ensureStripeConfigured()
    this.logger.log(`Creating subscription for customer: ${params.customerId}`)
    try {
      return await this.stripe.subscriptions.create({
        customer: params.customerId,
        items: [{ price: params.priceId }],
        trial_period_days: params.trialPeriodDays,
        metadata: params.metadata,
        expand: ['latest_invoice', 'customer'],
      })
    } catch (error) {
      this.logger.error(`Failed to create subscription: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async updateSubscription(
    subscriptionId: string,
    params: {
      priceId?: string
      cancelAtPeriodEnd?: boolean
      metadata?: Stripe.MetadataParam
    },
  ): Promise<Stripe.Subscription> {
    this.logger.log(`Updating subscription: ${subscriptionId}`)
    try {
      const updateParams: Stripe.SubscriptionUpdateParams = {
        metadata: params.metadata,
        cancel_at_period_end: params.cancelAtPeriodEnd,
      }

      // If changing price, update the subscription item
      if (params.priceId) {
        const subscription = await this.getSubscription(subscriptionId)
        const itemId = subscription.items.data[0]?.id
        if (itemId) {
          updateParams.items = [
            {
              id: itemId,
              price: params.priceId,
            },
          ]
        }
      }

      return await this.stripe.subscriptions.update(subscriptionId, updateParams)
    } catch (error) {
      this.logger.error(
        `Failed to update subscription ${subscriptionId}: ${this.getErrorMessage(error)}`,
      )
      throw error
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false,
  ): Promise<Stripe.Subscription> {
    this.logger.log(`Canceling subscription: ${subscriptionId} (immediate: ${immediate})`)
    try {
      if (immediate) {
        return await this.stripe.subscriptions.cancel(subscriptionId)
      } else {
        return await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        })
      }
    } catch (error) {
      this.logger.error(
        `Failed to cancel subscription ${subscriptionId}: ${this.getErrorMessage(error)}`,
      )
      throw error
    }
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice', 'customer', 'default_payment_method'],
      })
    } catch (error) {
      this.logger.error(
        `Failed to get subscription ${subscriptionId}: ${this.getErrorMessage(error)}`,
      )
      throw error
    }
  }

  async listSubscriptions(params?: {
    customerId?: string
    status?: Stripe.Subscription.Status
    limit?: number
  }): Promise<Stripe.ApiList<Stripe.Subscription>> {
    try {
      return await this.stripe.subscriptions.list({
        customer: params?.customerId,
        status: params?.status,
        limit: params?.limit,
      })
    } catch (error) {
      this.logger.error(`Failed to list subscriptions: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  // ============================================================================
  // CHECKOUT SESSIONS
  // ============================================================================

  async createCheckoutSession(params: {
    priceId: string
    customerId?: string
    customerEmail?: string
    successUrl: string
    cancelUrl: string
    trialPeriodDays?: number
    metadata?: Stripe.MetadataParam
  }): Promise<Stripe.Checkout.Session> {
    this.logger.log(`Creating checkout session for price: ${params.priceId}`)
    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        line_items: [
          {
            price: params.priceId,
            quantity: 1,
          },
        ],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
        subscription_data: {
          trial_period_days: params.trialPeriodDays,
          metadata: params.metadata,
        },
      }

      if (params.customerId) {
        sessionParams.customer = params.customerId
      } else if (params.customerEmail) {
        sessionParams.customer_email = params.customerEmail
      }

      return await this.stripe.checkout.sessions.create(sessionParams)
    } catch (error) {
      this.logger.error(`Failed to create checkout session: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer'],
      })
    } catch (error) {
      this.logger.error(
        `Failed to get checkout session ${sessionId}: ${this.getErrorMessage(error)}`,
      )
      throw error
    }
  }

  // ============================================================================
  // BILLING PORTAL
  // ============================================================================

  async createPortalSession(params: {
    customerId: string
    returnUrl: string
  }): Promise<Stripe.BillingPortal.Session> {
    this.logger.log(`Creating portal session for customer: ${params.customerId}`)
    try {
      return await this.stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
      })
    } catch (error) {
      this.logger.error(`Failed to create portal session: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  // ============================================================================
  // PAYMENT INTENTS (One-time payments)
  // ============================================================================

  async createPaymentIntent(params: {
    amount: number
    currency?: string
    customerId?: string
    description?: string
    metadata?: Stripe.MetadataParam
  }): Promise<Stripe.PaymentIntent> {
    this.logger.log(`Creating payment intent for amount: ${params.amount}`)
    try {
      return await this.stripe.paymentIntents.create({
        amount: params.amount,
        currency: params.currency || this.configService.stripe.currency || 'usd',
        customer: params.customerId,
        description: params.description,
        metadata: params.metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      })
    } catch (error) {
      this.logger.error(`Failed to create payment intent: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async confirmPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    this.logger.log(`Confirming payment intent: ${paymentIntentId}`)
    try {
      return await this.stripe.paymentIntents.confirm(paymentIntentId)
    } catch (error) {
      this.logger.error(
        `Failed to confirm payment intent ${paymentIntentId}: ${this.getErrorMessage(error)}`,
      )
      throw error
    }
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    this.logger.log(`Canceling payment intent: ${paymentIntentId}`)
    try {
      return await this.stripe.paymentIntents.cancel(paymentIntentId)
    } catch (error) {
      this.logger.error(
        `Failed to cancel payment intent ${paymentIntentId}: ${this.getErrorMessage(error)}`,
      )
      throw error
    }
  }

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  /**
   * Construct and verify a Stripe webhook event
   * This is used in the webhook controller to verify the signature
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    this.ensureStripeConfigured()
    const { webhookSecret } = this.configService.stripe

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  // ============================================================================
  // INVOICES
  // ============================================================================

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      return await this.stripe.invoices.retrieve(invoiceId)
    } catch (error) {
      this.logger.error(`Failed to get invoice ${invoiceId}: ${this.getErrorMessage(error)}`)
      throw error
    }
  }

  async listInvoices(params?: {
    customerId?: string
    subscriptionId?: string
    status?: Stripe.Invoice.Status
    limit?: number
  }): Promise<Stripe.ApiList<Stripe.Invoice>> {
    try {
      return await this.stripe.invoices.list({
        customer: params?.customerId,
        subscription: params?.subscriptionId,
        status: params?.status,
        limit: params?.limit,
      })
    } catch (error) {
      this.logger.error(`Failed to list invoices: ${this.getErrorMessage(error)}`)
      throw error
    }
  }
}
