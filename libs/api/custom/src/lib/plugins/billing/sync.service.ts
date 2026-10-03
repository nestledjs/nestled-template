import { Injectable, Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { StripeService } from '@nestled-template/api/integrations'
import { SubscriptionStatus } from '@nestled-template/api/prisma'
import type { Stripe } from 'stripe/cjs/stripe.core'

type StripeSubscriptionWithPeriods = Stripe.Subscription & {
  current_period_end: number
  trial_start?: number | null
  trial_end?: number | null
  cancel_at?: number | null
  canceled_at?: number | null
  cancel_at_period_end: boolean
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return error.toString()
  }

  if (typeof error === 'symbol') {
    return error.description ?? 'symbol'
  }

  if (error === undefined) {
    return 'undefined'
  }

  if (typeof error === 'function') {
    return error.name || 'anonymous function'
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error)
    } catch {
      return error.constructor.name || 'object'
    }
  }

  return 'null'
}

/**
 * Stripe Sync Service
 *
 * Manually syncs products, prices, and other data from Stripe to the database.
 * Use this for initial setup or to recover from sync failures.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name)

  constructor(
    private readonly stripe: StripeService,
    private readonly prisma: ApiCoreDataAccessService,
  ) {}

  /**
   * Sync all products from Stripe to database
   */
  async syncAllProducts(): Promise<{ synced: number; errors: number }> {
    this.logger.log('Starting full product sync from Stripe...')

    let synced = 0
    let errors = 0

    try {
      const products = await this.stripe.listProducts({ limit: 100 })

      for (const product of products.data) {
        try {
          await this.syncProductFromStripe(product.id)
          synced++
        } catch (error) {
          this.logger.error(`Failed to sync product ${product.id}: ${errorMessage(error)}`)
          errors++
        }
      }

      this.logger.log(`Product sync complete: ${synced} synced, ${errors} errors`)
      return { synced, errors }
    } catch (error) {
      this.logger.error(`Failed to list products from Stripe: ${errorMessage(error)}`)
      throw error
    }
  }

  /**
   * Sync a single product from Stripe to database
   */
  async syncProductFromStripe(stripeProductId: string): Promise<void> {
    this.logger.log(`Syncing product from Stripe: ${stripeProductId}`)

    try {
      const product = await this.stripe.getProduct(stripeProductId)

      // Get the default price for this product
      let defaultPrice: Stripe.Price | null = null
      if (product.default_price) {
        const priceId =
          typeof product.default_price === 'string'
            ? product.default_price
            : product.default_price.id
        defaultPrice = await this.stripe.getPrice(priceId)
      }

      if (!defaultPrice) {
        this.logger.warn(`Product ${stripeProductId} has no default price, skipping...`)
        return
      }

      // Determine interval
      let interval = 'one_time'
      if (defaultPrice.recurring) {
        interval = defaultPrice.recurring.interval
      }

      // Upsert the plan
      await this.prisma.plan.upsert({
        where: { stripeProductId },
        create: {
          name: product.name,
          description: product.description || undefined,
          price: defaultPrice.unit_amount ? defaultPrice.unit_amount / 100 : 0,
          interval,
          stripeProductId,
          stripePriceId: defaultPrice.id,
          active: product.active,
          features: product.metadata?.['features']
            ? JSON.parse(product.metadata['features'])
            : null,
          limits: product.metadata?.['limits'] ? JSON.parse(product.metadata['limits']) : null,
          trialPeriodDays: defaultPrice.recurring?.trial_period_days || undefined,
        },
        update: {
          name: product.name,
          description: product.description || undefined,
          price: defaultPrice.unit_amount ? defaultPrice.unit_amount / 100 : 0,
          interval,
          stripePriceId: defaultPrice.id,
          active: product.active,
          features: product.metadata?.['features']
            ? JSON.parse(product.metadata['features'])
            : null,
          limits: product.metadata?.['limits'] ? JSON.parse(product.metadata['limits']) : null,
          trialPeriodDays: defaultPrice.recurring?.trial_period_days || undefined,
        },
      })

      this.logger.log(`Successfully synced product: ${product.name}`)
    } catch (error) {
      this.logger.error(`Failed to sync product ${stripeProductId}: ${errorMessage(error)}`)
      throw error
    }
  }

  /**
   * Sync all prices from Stripe to database
   */
  async syncAllPrices(): Promise<{ synced: number; errors: number }> {
    this.logger.log('Starting full price sync from Stripe...')

    let synced = 0
    let errors = 0

    try {
      const prices = await this.stripe.listPrices({ active: true, limit: 100 })

      for (const price of prices.data) {
        try {
          await this.syncPriceFromStripe(price.id)
          synced++
        } catch (error) {
          this.logger.error(`Failed to sync price ${price.id}: ${errorMessage(error)}`)
          errors++
        }
      }

      this.logger.log(`Price sync complete: ${synced} synced, ${errors} errors`)
      return { synced, errors }
    } catch (error) {
      this.logger.error(`Failed to list prices from Stripe: ${errorMessage(error)}`)
      throw error
    }
  }

  /**
   * Sync a single price from Stripe to database
   */
  async syncPriceFromStripe(stripePriceId: string): Promise<void> {
    this.logger.log(`Syncing price from Stripe: ${stripePriceId}`)

    try {
      const price = await this.stripe.getPrice(stripePriceId)

      // Get the product
      const productId = typeof price.product === 'string' ? price.product : price.product.id
      const product = await this.stripe.getProduct(productId)

      // Determine interval
      let interval = 'one_time'
      if (price.recurring) {
        interval = price.recurring.interval
      }

      // Upsert the plan
      await this.prisma.plan.upsert({
        where: { stripePriceId },
        create: {
          name: product.name,
          description: product.description || undefined,
          price: price.unit_amount ? price.unit_amount / 100 : 0,
          interval,
          stripeProductId: productId,
          stripePriceId,
          active: price.active && product.active,
          features: product.metadata?.['features']
            ? JSON.parse(product.metadata['features'])
            : null,
          limits: product.metadata?.['limits'] ? JSON.parse(product.metadata['limits']) : null,
          trialPeriodDays: price.recurring?.trial_period_days || undefined,
        },
        update: {
          price: price.unit_amount ? price.unit_amount / 100 : 0,
          interval,
          active: price.active && product.active,
          trialPeriodDays: price.recurring?.trial_period_days || undefined,
        },
      })

      this.logger.log(`Successfully synced price: ${stripePriceId}`)
    } catch (error) {
      this.logger.error(`Failed to sync price ${stripePriceId}: ${errorMessage(error)}`)
      throw error
    }
  }

  /**
   * Sync a subscription from Stripe to database
   */
  async syncSubscriptionFromStripe(stripeSubscriptionId: string): Promise<void> {
    this.logger.log(`Syncing subscription from Stripe: ${stripeSubscriptionId}`)

    try {
      const stripeSubscription = await this.stripe.getSubscription(stripeSubscriptionId)
      const stripeCustomerId =
        typeof stripeSubscription.customer === 'string'
          ? stripeSubscription.customer
          : stripeSubscription.customer.id

      // Find the organization by customer ID
      const dbSubscription = await this.prisma.subscription.findFirst({
        where: { stripeCustomerId },
      })

      if (!dbSubscription) {
        this.logger.error(`No subscription found for customer ${stripeCustomerId}`)
        return
      }

      // Map status
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

      const status = statusMap[stripeSubscription.status] || SubscriptionStatus.INCOMPLETE

      // Extract properties to avoid type confusion
      const {
        current_period_end: currentPeriodEnd,
        trial_start: trialStart,
        trial_end: trialEnd,
        cancel_at: cancelAt,
        canceled_at: canceledAt,
        cancel_at_period_end: cancelAtPeriodEnd,
      } = stripeSubscription as StripeSubscriptionWithPeriods

      // Update subscription
      await this.prisma.subscription.update({
        where: { id: dbSubscription.id },
        data: {
          stripeSubscriptionId: stripeSubscription.id,
          stripePriceId: stripeSubscription.items.data[0]?.price.id,
          status,
          stripeCurrentPeriodEnd: new Date(currentPeriodEnd * 1000),
          trialStart: trialStart ? new Date(trialStart * 1000) : null,
          trialEnd: trialEnd ? new Date(trialEnd * 1000) : null,
          cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
          canceledAt: canceledAt ? new Date(canceledAt * 1000) : null,
          cancelAtPeriodEnd: cancelAtPeriodEnd,
        },
      })

      this.logger.log(`Successfully synced subscription: ${stripeSubscriptionId}`)
    } catch (error) {
      this.logger.error(
        `Failed to sync subscription ${stripeSubscriptionId}: ${errorMessage(error)}`,
      )
      throw error
    }
  }

  /**
   * Sync customer from Stripe to database
   */
  async syncCustomerFromStripe(stripeCustomerId: string): Promise<void> {
    this.logger.log(`Syncing customer from Stripe: ${stripeCustomerId}`)

    try {
      await this.stripe.getCustomer(stripeCustomerId)

      // Update subscription with customer ID if found
      const subscription = await this.prisma.subscription.findFirst({
        where: { stripeCustomerId },
      })

      if (subscription) {
        this.logger.log(`Customer ${stripeCustomerId} already linked to subscription`)
      } else {
        this.logger.warn(`No subscription found for customer ${stripeCustomerId}`)
      }
    } catch (error) {
      this.logger.error(`Failed to sync customer ${stripeCustomerId}: ${errorMessage(error)}`)
      throw error
    }
  }
}
