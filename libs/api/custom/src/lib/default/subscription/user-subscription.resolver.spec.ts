import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
  AccessPolicyGuard,
  GqlOrganizationScopedGuard,
  OrganizationContextService,
} from '@nestled-template/api/utils'
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

    await expect(resolver.createCheckoutSession('price-1', createUser(), 'org-1')).resolves.toBe(
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

    await expect(resolver.createPortalSession(createUser(), 'org-1')).resolves.toBe(
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

    await expect(resolver.cancelSubscription(createUser(), 'org-1')).resolves.toBe(
      updatedSubscription,
    )

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

    await expect(resolver.createCheckoutSession('price-1', createUser(), 'org-1')).resolves.toBe(
      'https://checkout.stripe.test/cs-1',
    )
    expect(Logger.warn).toHaveBeenCalledWith(
      'Failed to record audit log BILLING_CHECKOUT_SESSION_CREATED for Organization org-1: audit unavailable',
    )
  })
})

describe('UserSubscriptionResolver billing authorization', () => {
  const roles = {
    Owner: [
      { subject: 'billing', action: 'manage' },
      { subject: 'billing', action: 'read' },
    ],
    Admin: [{ subject: 'billing', action: 'read' }],
    Member: [{ subject: 'organization', action: 'read' }],
  }

  // The real guard and context service, over a membership table the test controls.
  function authorize(
    operation: keyof UserSubscriptionResolver,
    membership: keyof typeof roles | null,
    user = { id: 'user-1', activeOrganizationId: 'org-1', isSuperAdmin: false },
  ) {
    const data = {
      organizationMember: {
        findFirst: jest.fn().mockResolvedValue(
          membership
            ? {
                roleId: `role-${membership}`,
                role: { name: membership, permissions: roles[membership] },
              }
            : null,
        ),
      },
    }
    const guard = new AccessPolicyGuard(
      new Reflector(),
      {} as never,
      new OrganizationContextService(data as never),
    )
    const req: { headers: object; user: typeof user; organizationContext?: unknown } = {
      headers: {},
      user,
    }
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => UserSubscriptionResolver.prototype[operation],
      getClass: () => UserSubscriptionResolver,
    } as unknown as ExecutionContext
    return { result: guard.canActivate(context), req, data }
  }

  const mutations = ['createCheckoutSession', 'createPortalSession', 'cancelSubscription'] as const
  const reads = ['currentSubscription', 'currentUsage'] as const

  it.each(mutations)('lets an Owner run %s against their organization', async operation => {
    const { result, req } = authorize(operation, 'Owner')
    await expect(result).resolves.toBe(true)
    expect(req.organizationContext).toEqual(expect.objectContaining({ organizationId: 'org-1' }))
  })

  it.each(mutations)('refuses %s to an Admin, who can only read billing', async operation => {
    await expect(authorize(operation, 'Admin').result).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each([...mutations, ...reads])(
    'refuses %s to a Member without billing permissions',
    async operation => {
      await expect(authorize(operation, 'Member').result).rejects.toBeInstanceOf(ForbiddenException)
    },
  )

  it.each(reads)('lets an Admin read %s', async operation => {
    await expect(authorize(operation, 'Admin').result).resolves.toBe(true)
  })

  it.each([...mutations, ...reads])(
    'refuses %s to a removed member whose active organization still names the organization',
    async operation => {
      const { result, data } = authorize(operation, null)
      await expect(result).rejects.toBeInstanceOf(ForbiddenException)
      expect(data.organizationMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', organizationId: 'org-1' } }),
      )
    },
  )
})

describe('UserSubscriptionResolver.currentSubscriptionActive', () => {
  const roles = {
    Owner: [{ subject: 'billing', action: 'manage' }],
    Member: [{ subject: 'organization', action: 'read' }],
  }

  function membershipData(membership: keyof typeof roles | null) {
    return {
      organizationMember: {
        findFirst: jest.fn().mockResolvedValue(
          membership
            ? {
                roleId: `role-${membership}`,
                role: { name: membership, permissions: roles[membership] },
              }
            : null,
        ),
      },
    }
  }

  // The operation's own guards, with the JWT check stubbed and the real membership lookup.
  function admit(membership: keyof typeof roles | null) {
    jest
      .spyOn(Object.getPrototypeOf(GqlOrganizationScopedGuard.prototype), 'canActivate')
      .mockResolvedValue(true)
    const data = membershipData(membership)
    const guard = new GqlOrganizationScopedGuard(new OrganizationContextService(data as never))
    const req: { headers: object; user: object; organizationContext?: { organizationId: string } } =
      {
        headers: {},
        user: { id: 'user-1', activeOrganizationId: 'org-1', isSuperAdmin: false },
      }
    const context = {
      getType: () => 'graphql',
      getArgs: () => [{}, {}, { req }, {}],
      getHandler: () => UserSubscriptionResolver.prototype.currentSubscriptionActive,
      getClass: () => UserSubscriptionResolver,
    } as unknown as ExecutionContext
    return { result: guard.canActivate(context), req, data }
  }

  afterEach(() => jest.restoreAllMocks())

  it('declares no billing permission, only organization membership', () => {
    const handler = UserSubscriptionResolver.prototype.currentSubscriptionActive
    // The key RequireOrganizationPermission / AccessPolicy store their policy under.
    expect(Reflect.getMetadata('nestled:accessPolicy', handler)).toBeUndefined()
    expect(Reflect.getMetadata('__guards__', handler)).toEqual([GqlOrganizationScopedGuard])
  })

  it('admits a Member of the organization, against the membership-checked organization', async () => {
    const { result, req } = admit('Member')
    await expect(result).resolves.toBe(true)
    expect(req.organizationContext).toEqual(expect.objectContaining({ organizationId: 'org-1' }))
  })

  it('refuses a removed member whose active organization still names the organization', async () => {
    const { result, data } = admit(null)
    await expect(result).rejects.toBeInstanceOf(ForbiddenException)
    expect(data.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', organizationId: 'org-1' } }),
    )
  })

  it.each([
    ['ACTIVE', true],
    ['TRIALING', true],
    ['PAST_DUE', false],
    ['CANCELED', false],
    ['INCOMPLETE', false],
    ['INCOMPLETE_EXPIRED', false],
  ])('reports a %s subscription as active: %s', async (status, expected) => {
    const data = createDataMock()
    data.subscription.findUnique.mockResolvedValue({ status })
    const resolver = new UserSubscriptionResolver(
      data,
      createStripeMock(),
      createUsageMock(),
      createConfigMock(),
    )

    await expect(resolver.currentSubscriptionActive('org-1')).resolves.toBe(expected)
    expect(data.subscription.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { status: true },
    })
  })

  it('reports an organization without a subscription as inactive', async () => {
    const data = createDataMock()
    data.subscription.findUnique.mockResolvedValue(null)
    const resolver = new UserSubscriptionResolver(
      data,
      createStripeMock(),
      createUsageMock(),
      createConfigMock(),
    )

    await expect(resolver.currentSubscriptionActive('org-1')).resolves.toBe(false)
  })
})
