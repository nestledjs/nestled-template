import { ConfigService } from '@nestled-template/api/config'
import { StripeService } from './stripe.service'

function createService(stripe: Record<string, unknown>, currency = 'usd', webhookSecret = 'whsec') {
  const service = new StripeService({
    stripe: {
      secretKey: 'sk_test_123',
      currency,
      webhookSecret,
    },
  } as ConfigService)
  ;(service as unknown as { stripe: Record<string, unknown> }).stripe = stripe
  return service
}

function createStripeMock() {
  return {
    products: {
      create: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      update: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    prices: {
      create: jest.fn().mockResolvedValue({ id: 'price-1' }),
      update: jest.fn().mockResolvedValue({ id: 'price-1' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'price-1' }),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus-1' }),
      update: jest.fn().mockResolvedValue({ id: 'cus-1' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cus-1' }),
      del: jest.fn().mockResolvedValue({ id: 'cus-1', deleted: true }),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'sub-1', items: { data: [{ id: 'si-1' }] } }),
      cancel: jest.fn().mockResolvedValue({ id: 'sub-1', canceled_at: 1 }),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs-1' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'cs-1' }),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'bps-1' }),
      },
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi-1' }),
      confirm: jest.fn().mockResolvedValue({ id: 'pi-1', status: 'succeeded' }),
      cancel: jest.fn().mockResolvedValue({ id: 'pi-1', status: 'canceled' }),
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({ id: 'evt-1', type: 'customer.created' }),
    },
    invoices: {
      retrieve: jest.fn().mockResolvedValue({ id: 'in-1' }),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
  }
}

describe('StripeService', () => {
  it('requires configuration before exposing the raw client', () => {
    const service = new StripeService({
      stripe: { secretKey: '', currency: 'usd' },
    } as ConfigService)

    expect(() => service.getClient()).toThrow('Stripe is not configured')
  })

  it('passes product, price, customer, subscription, checkout, payment, webhook, and invoice calls to Stripe', async () => {
    const stripe = createStripeMock()
    const service = createService(stripe)

    expect(service.getClient()).toBe(stripe)
    await service.createProduct({ name: 'Growth', metadata: { tier: 'growth' } })
    await service.updateProduct('prod-1', { active: true })
    await service.getProduct('prod-1')
    await service.listProducts({ active: true, limit: 10 })
    await service.archiveProduct('prod-1')

    await service.createPrice({
      productId: 'prod-1',
      unitAmount: 9900,
      interval: 'month',
      intervalCount: 2,
      trialPeriodDays: 14,
    })
    await service.updatePrice('price-1', { active: false })
    await service.getPrice('price-1')
    await service.listPrices({ productId: 'prod-1', active: true, limit: 3 })
    await service.archivePrice('price-1')

    await service.createCustomer({ email: 'ada@example.com', name: 'Ada' })
    await service.updateCustomer('cus-1', { name: 'Ada Lovelace' })
    await service.getCustomer('cus-1')
    await service.deleteCustomer('cus-1')

    await service.createSubscription({ customerId: 'cus-1', priceId: 'price-1' })
    await service.updateSubscription('sub-1', { priceId: 'price-2', cancelAtPeriodEnd: false })
    await service.cancelSubscription('sub-1')
    await service.cancelSubscription('sub-1', true)
    await service.getSubscription('sub-1')
    await service.listSubscriptions({ customerId: 'cus-1', status: 'active', limit: 5 } as never)

    await service.createCheckoutSession({
      priceId: 'price-1',
      customerEmail: 'ada@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      trialPeriodDays: 7,
    })
    await service.getCheckoutSession('cs-1')
    await service.createPortalSession({ customerId: 'cus-1', returnUrl: 'https://example.com' })

    await service.createPaymentIntent({
      amount: 1000,
      customerId: 'cus-1',
      description: 'Setup',
    })
    await service.confirmPaymentIntent('pi-1')
    await service.cancelPaymentIntent('pi-1')
    expect(service.constructWebhookEvent('{}', 'sig')).toEqual({
      id: 'evt-1',
      type: 'customer.created',
    })
    await service.getInvoice('in-1')
    await service.listInvoices({ customerId: 'cus-1', subscriptionId: 'sub-1', limit: 10 })

    expect(stripe.products.create).toHaveBeenCalledWith({
      name: 'Growth',
      description: undefined,
      metadata: { tier: 'growth' },
    })
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'prod-1',
        unit_amount: 9900,
        currency: 'usd',
        recurring: {
          interval: 'month',
          interval_count: 2,
          trial_period_days: 14,
        },
      }),
    )
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub-1', {
      cancel_at_period_end: true,
    })
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith('{}', 'sig', 'whsec')
  })

  it('propagates Stripe errors with the original failure', async () => {
    const stripe = createStripeMock()
    stripe.products.create.mockRejectedValue(new Error('Stripe unavailable'))
    const service = createService(stripe)

    await expect(service.createProduct({ name: 'Growth' })).rejects.toThrow('Stripe unavailable')
  })
})
