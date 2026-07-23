import { Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { Subscription, User } from '@nestled-template/api/core/models'
import { ConfigService } from '@nestled-template/api/config'
import { StripeService } from '@nestled-template/api/integrations'
import { UserSubscriptionResolver } from './user-subscription.resolver'
import { UsageService } from '../../plugins/billing/usage.service'

type DataMock = {
  organization: {
    findUnique: jest.Mock
  }
  plan: {
    findUnique: jest.Mock
  }
  subscription: {
    findUnique: jest.Mock
    update: jest.Mock
  }
  auditLog: {
    create: jest.Mock
  }
}

type StripeMock = {
  createCustomer: jest.Mock
  createCheckoutSession: jest.Mock
  createPortalSession: jest.Mock
  cancelSubscription: jest.Mock
}

type UsageMock = {
  getUsageWithLimits: jest.Mock
}

function createDataMock(): DataMock & ApiCoreDataAccessService {
  return Object.assign(Object.create(ApiCoreDataAccessService.prototype), {
    organization: {
      findUnique: jest.fn(),
    },
    plan: {
      findUnique: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  })
}

function createStripeMock(): StripeMock & StripeService {
  return Object.assign(Object.create(StripeService.prototype), {
    createCustomer: jest.fn(),
    createCheckoutSession: jest.fn(),
    createPortalSession: jest.fn(),
    cancelSubscription: jest.fn(),
  })
}

function createUsageMock(): UsageMock & UsageService {
  return Object.assign(Object.create(UsageService.prototype), {
    getUsageWithLimits: jest.fn(),
  })
}

function createConfigMock(): ConfigService {
  const config: ConfigService = Object.create(ConfigService.prototype)
  Object.defineProperty(config, 'siteUrl', {
    value: 'https://app.example.com',
    configurable: true,
  })
  return config
}

function createUser(): User {
  return Object.assign(new User(), {
    id: 'user-1',
    activeOrganizationId: 'org-1',
    emails: [{ email: 'user@example.com', primary: true }],
  })
}

describe('UserSubscriptionResolver audit coverage', () => {
  let resolver: UserSubscriptionResolver
  let data: DataMock & ApiCoreDataAccessService
  let stripe: StripeMock & StripeService

  beforeEach(() => {
    data = createDataMock()
    stripe = createStripeMock()
    resolver = new UserSubscriptionResolver(data, stripe, createUsageMock(), createConfigMock())
    jest.spyOn(Logger, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('records checkout session creation after Stripe session creation', async () => {
    data.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      emails: [{ email: 'billing@example.com', primary: true }],
      subscription: null,
    })
    data.plan.findUnique.mockResolvedValue({
      id: 'plan-1',
      trialPeriodDays: 14,
    })
    stripe.createCustomer.mockResolvedValue({ id: 'cus-1' })
    stripe.createCheckoutSession.mockResolvedValue({
      id: 'cs-1',
      url: 'https://checkout.stripe.test/cs-1',
    })

    await expect(resolver.createCheckoutSession('price-1', createUser())).resolves.toBe(
      'https://checkout.stripe.test/cs-1',
    )

    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        organizationId: 'org-1',
        entityId: 'org-1',
        entityType: 'Organization',
        action: 'BILLING_CHECKOUT_SESSION_CREATED',
        changes: {
          priceId: 'price-1',
          planId: 'plan-1',
          checkoutSessionId: 'cs-1',
        },
      },
    })
  })

  it('records billing portal session creation', async () => {
    data.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      stripeCustomerId: 'cus-1',
    })
    stripe.createPortalSession.mockResolvedValue({
      id: 'bps-1',
      url: 'https://billing.stripe.test/session',
    })

    await expect(resolver.createPortalSession(createUser())).resolves.toBe(
      'https://billing.stripe.test/session',
    )

    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        organizationId: 'org-1',
        entityId: 'sub-1',
        entityType: 'Subscription',
        action: 'BILLING_PORTAL_SESSION_CREATED',
        changes: {
          portalSessionId: 'bps-1',
        },
      },
    })
  })

  it('records subscription cancellation after the local subscription update', async () => {
    const updatedSubscription = Object.assign(new Subscription(), {
      id: 'sub-1',
      cancelAtPeriodEnd: true,
    })
    data.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      stripeSubscriptionId: 'stripe-sub-1',
    })
    data.subscription.update.mockResolvedValue(updatedSubscription)
    stripe.cancelSubscription.mockResolvedValue({ id: 'stripe-sub-1' })

    await expect(resolver.cancelSubscription(createUser())).resolves.toBe(updatedSubscription)

    expect(stripe.cancelSubscription).toHaveBeenCalledWith('stripe-sub-1', false)
    expect(data.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        organizationId: 'org-1',
        entityId: 'sub-1',
        entityType: 'Subscription',
        action: 'SUBSCRIPTION_CANCEL_AT_PERIOD_END',
        changes: {
          stripeSubscriptionId: 'stripe-sub-1',
        },
      },
    })
  })

  it('does not fail checkout when audit logging fails', async () => {
    data.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      emails: [],
      subscription: { stripeCustomerId: 'cus-1' },
    })
    data.plan.findUnique.mockResolvedValue(null)
    data.auditLog.create.mockRejectedValue(new Error('audit unavailable'))
    stripe.createCheckoutSession.mockResolvedValue({
      id: 'cs-1',
      url: 'https://checkout.stripe.test/cs-1',
    })

    await expect(resolver.createCheckoutSession('price-1', createUser())).resolves.toBe(
      'https://checkout.stripe.test/cs-1',
    )
    expect(Logger.warn).toHaveBeenCalledWith(
      'Failed to record audit log BILLING_CHECKOUT_SESSION_CREATED for Organization org-1: audit unavailable',
    )
  })
})
