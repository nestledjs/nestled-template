import { Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import { BillingResolver } from './billing.resolver'
import { SyncService } from './sync.service'

type DataMock = {
  auditLog: {
    create: jest.Mock
  }
  plan: {
    findMany: jest.Mock
  }
  subscription: {
    findMany: jest.Mock
    count: jest.Mock
  }
}

type SyncMock = {
  syncAllProducts: jest.Mock
  syncAllPrices: jest.Mock
  syncProductFromStripe: jest.Mock
  syncPriceFromStripe: jest.Mock
  syncSubscriptionFromStripe: jest.Mock
}

function createDataMock(): DataMock & ApiCoreDataAccessService {
  return Object.assign(Object.create(ApiCoreDataAccessService.prototype), {
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    plan: {
      findMany: jest.fn().mockResolvedValue([{ id: 'plan-1' }]),
    },
    subscription: {
      findMany: jest.fn().mockResolvedValue([{ id: 'sub-1' }]),
      count: jest.fn().mockResolvedValue(1),
    },
  })
}

function createSyncMock(): SyncMock & SyncService {
  return Object.assign(Object.create(SyncService.prototype), {
    syncAllProducts: jest.fn().mockResolvedValue({ synced: 2, errors: 0 }),
    syncAllPrices: jest.fn().mockResolvedValue({ synced: 3, errors: 1 }),
    syncProductFromStripe: jest.fn().mockResolvedValue(undefined),
    syncPriceFromStripe: jest.fn().mockResolvedValue(undefined),
    syncSubscriptionFromStripe: jest.fn().mockResolvedValue(undefined),
  })
}

function createAdminUser(): User {
  return Object.assign(new User(), {
    id: 'admin-1',
    isSuperAdmin: true,
  })
}

describe('BillingResolver audit coverage', () => {
  let resolver: BillingResolver
  let data: DataMock & ApiCoreDataAccessService
  let syncService: SyncMock & SyncService

  beforeEach(() => {
    data = createDataMock()
    syncService = createSyncMock()
    resolver = new BillingResolver(syncService, data)
    jest.spyOn(Logger, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('records bulk product sync results', async () => {
    await expect(resolver.syncStripeProducts(createAdminUser())).resolves.toBe(true)

    expect(syncService.syncAllProducts).toHaveBeenCalledWith()
    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        entityId: 'stripe-products',
        entityType: 'StripeProduct',
        action: 'STRIPE_PRODUCTS_SYNCED',
        changes: { synced: 2, errors: 0 },
      },
    })
  })

  it('records bulk price sync results', async () => {
    await expect(resolver.syncStripePrices(createAdminUser())).resolves.toBe(true)

    expect(syncService.syncAllPrices).toHaveBeenCalledWith()
    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        entityId: 'stripe-prices',
        entityType: 'StripePrice',
        action: 'STRIPE_PRICES_SYNCED',
        changes: { synced: 3, errors: 1 },
      },
    })
  })

  it('records single Stripe object syncs', async () => {
    const admin = createAdminUser()

    await expect(resolver.syncStripeProduct('prod-1', admin)).resolves.toBe(true)
    await expect(resolver.syncStripePrice('price-1', admin)).resolves.toBe(true)
    await expect(resolver.syncStripeSubscription('sub-1', admin)).resolves.toBe(true)

    expect(syncService.syncProductFromStripe).toHaveBeenCalledWith('prod-1')
    expect(syncService.syncPriceFromStripe).toHaveBeenCalledWith('price-1')
    expect(syncService.syncSubscriptionFromStripe).toHaveBeenCalledWith('sub-1')
    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        entityId: 'prod-1',
        entityType: 'StripeProduct',
        action: 'STRIPE_PRODUCT_SYNCED',
        changes: { productId: 'prod-1' },
      },
    })
    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        entityId: 'price-1',
        entityType: 'StripePrice',
        action: 'STRIPE_PRICE_SYNCED',
        changes: { priceId: 'price-1' },
      },
    })
    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        entityId: 'sub-1',
        entityType: 'StripeSubscription',
        action: 'STRIPE_SUBSCRIPTION_SYNCED',
        changes: { subscriptionId: 'sub-1' },
      },
    })
  })

  it('does not fail sync when audit logging fails', async () => {
    data.auditLog.create.mockRejectedValue(new Error('audit unavailable'))

    await expect(resolver.syncStripeProduct('prod-1', createAdminUser())).resolves.toBe(true)

    expect(Logger.warn).toHaveBeenCalledWith(
      'Failed to record audit log STRIPE_PRODUCT_SYNCED for StripeProduct prod-1: audit unavailable',
    )
  })
})

describe('BillingResolver admin queries', () => {
  it('returns plans newest first', async () => {
    const data = createDataMock()
    const resolver = new BillingResolver(createSyncMock(), data)

    await expect(resolver.adminBillingPlans()).resolves.toEqual([{ id: 'plan-1' }])
    expect(data.plan.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } })
  })

  it('defaults paging and includes the relations the SDK document selects', async () => {
    const data = createDataMock()
    const resolver = new BillingResolver(createSyncMock(), data)

    await expect(resolver.adminBillingSubscriptions()).resolves.toEqual({
      subscriptions: [{ id: 'sub-1' }],
      total: 1,
    })

    const args = data.subscription.findMany.mock.calls[0][0]
    expect(args.skip).toBe(0)
    expect(args.take).toBe(50)
    expect(args.where).toBeUndefined()
    // organization.emails is selected by the admin Billing document; a narrower include resolves
    // the field to null rather than failing, so the include must stay in step with the selection.
    expect(args.include).toEqual({ organization: { include: { emails: true } }, plan: true })
  })

  it('clamps take to 100 and floors skip at 0', async () => {
    const data = createDataMock()
    const resolver = new BillingResolver(createSyncMock(), data)

    await resolver.adminBillingSubscriptions({ skip: -5, take: 5000 })

    const args = data.subscription.findMany.mock.calls[0][0]
    expect(args.take).toBe(100)
    expect(args.skip).toBe(0)
  })

  it('raises a take of 0 to 1 rather than returning an unbounded page', async () => {
    const data = createDataMock()
    const resolver = new BillingResolver(createSyncMock(), data)

    await resolver.adminBillingSubscriptions({ take: 0 })

    expect(data.subscription.findMany.mock.calls[0][0].take).toBe(1)
  })

  it('filters by organization name when a search term is given, and counts the same filter', async () => {
    const data = createDataMock()
    const resolver = new BillingResolver(createSyncMock(), data)

    await resolver.adminBillingSubscriptions({ search: '  Acme  ' })

    const where = { organization: { name: { contains: 'Acme', mode: 'insensitive' } } }
    expect(data.subscription.findMany.mock.calls[0][0].where).toEqual(where)
    expect(data.subscription.count).toHaveBeenCalledWith({ where })
  })

  it('treats a whitespace-only search as no filter', async () => {
    const data = createDataMock()
    const resolver = new BillingResolver(createSyncMock(), data)

    await resolver.adminBillingSubscriptions({ search: '   ' })

    expect(data.subscription.findMany.mock.calls[0][0].where).toBeUndefined()
  })
})
