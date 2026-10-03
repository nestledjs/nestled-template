import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { StripeService } from '@nestled-template/api/integrations'
import { SyncService } from './sync.service'

describe('SyncService', () => {
  let service: SyncService
  let stripe: jest.Mocked<StripeService>
  let prisma: any

  beforeEach(() => {
    stripe = {
      listProducts: jest.fn(),
      getProduct: jest.fn(),
      listPrices: jest.fn(),
      getPrice: jest.fn(),
      getSubscription: jest.fn(),
      getCustomer: jest.fn(),
    } as any
    prisma = {
      plan: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      subscription: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    service = new SyncService(stripe, prisma as ApiCoreDataAccessService)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const product = {
    id: 'prod-1',
    name: 'Team',
    description: 'Team plan',
    active: true,
    default_price: 'price-1',
    metadata: {
      features: JSON.stringify(['members']),
      limits: JSON.stringify({ seats: 10 }),
    },
  } as any

  const recurringPrice = {
    id: 'price-1',
    product: 'prod-1',
    unit_amount: 2900,
    active: true,
    recurring: { interval: 'month', trial_period_days: 14 },
  } as any

  it('syncs all products and counts per-product failures without aborting the batch', async () => {
    stripe.listProducts.mockResolvedValue({
      data: [{ id: 'prod-1' }, { id: 'prod-missing-price' }],
    } as any)
    stripe.getProduct
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce({ ...product, id: 'prod-missing-price', default_price: null })
    stripe.getPrice.mockResolvedValue(recurringPrice)

    await expect(service.syncAllProducts()).resolves.toEqual({ synced: 2, errors: 0 })

    expect(stripe.listProducts).toHaveBeenCalledWith({ limit: 100 })
    expect(prisma.plan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeProductId: 'prod-1' },
        create: expect.objectContaining({
          name: 'Team',
          price: 29,
          interval: 'month',
          features: ['members'],
          limits: { seats: 10 },
          trialPeriodDays: 14,
        }),
      }),
    )
  })

  it('rethrows when products cannot be listed', async () => {
    const error = new Error('stripe unavailable')
    stripe.listProducts.mockRejectedValue(error)

    await expect(service.syncAllProducts()).rejects.toThrow('stripe unavailable')
  })

  it('syncs a one-time price and uses expanded product objects when available', async () => {
    const expandedPrice = {
      id: 'price-once',
      product: { id: 'prod-1' },
      unit_amount: null,
      active: true,
      recurring: null,
    } as any
    stripe.getPrice.mockResolvedValue(expandedPrice)
    stripe.getProduct.mockResolvedValue({ ...product, default_price: null, metadata: {} })

    await service.syncPriceFromStripe('price-once')

    expect(stripe.getProduct).toHaveBeenCalledWith('prod-1')
    expect(prisma.plan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripePriceId: 'price-once' },
        create: expect.objectContaining({
          price: 0,
          interval: 'one_time',
          stripeProductId: 'prod-1',
          active: true,
          features: null,
          limits: null,
        }),
        update: expect.objectContaining({
          price: 0,
          interval: 'one_time',
          active: true,
        }),
      }),
    )
  })

  it('syncs all prices and reports item-level errors', async () => {
    stripe.listPrices.mockResolvedValue({
      data: [{ id: 'price-1' }, { id: 'price-bad' }],
    } as any)
    stripe.getPrice.mockResolvedValueOnce(recurringPrice).mockRejectedValueOnce(new Error('bad'))
    stripe.getProduct.mockResolvedValue(product)

    await expect(service.syncAllPrices()).resolves.toEqual({ synced: 1, errors: 1 })
    expect(stripe.listPrices).toHaveBeenCalledWith({ active: true, limit: 100 })
  })

  it('updates an existing subscription with mapped status and Stripe period dates', async () => {
    stripe.getSubscription.mockResolvedValue({
      id: 'sub-1',
      customer: { id: 'cus-1' },
      status: 'trialing',
      current_period_end: 1_800_000_000,
      trial_start: 1_700_000_000,
      trial_end: 1_710_000_000,
      cancel_at: null,
      canceled_at: null,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price-1' } }] },
    } as any)
    prisma.subscription.findFirst.mockResolvedValue({ id: 'db-sub-1' })

    await service.syncSubscriptionFromStripe('sub-1')

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'db-sub-1' },
      data: expect.objectContaining({
        stripeSubscriptionId: 'sub-1',
        stripePriceId: 'price-1',
        status: 'TRIALING',
        stripeCurrentPeriodEnd: new Date(1_800_000_000 * 1000),
        trialStart: new Date(1_700_000_000 * 1000),
        trialEnd: new Date(1_710_000_000 * 1000),
        cancelAtPeriodEnd: false,
      }),
    })
  })

  it('skips subscription updates when no local customer subscription exists', async () => {
    stripe.getSubscription.mockResolvedValue({
      id: 'sub-1',
      customer: 'cus-1',
      status: 'active',
      current_period_end: 1_800_000_000,
      items: { data: [] },
    } as any)
    prisma.subscription.findFirst.mockResolvedValue(null)

    await service.syncSubscriptionFromStripe('sub-1')

    expect(prisma.subscription.update).not.toHaveBeenCalled()
  })

  it('checks customer linkage and rethrows customer lookup failures', async () => {
    stripe.getCustomer.mockResolvedValue({ id: 'cus-1' } as any)
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub-1' })

    await expect(service.syncCustomerFromStripe('cus-1')).resolves.toBeUndefined()

    stripe.getCustomer.mockRejectedValueOnce(new Error('missing customer'))
    await expect(service.syncCustomerFromStripe('missing')).rejects.toThrow('missing customer')
  })
})
