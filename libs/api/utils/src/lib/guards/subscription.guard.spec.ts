import { ExecutionContext, HttpException } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { SubscriptionGuard } from './subscription.guard'

describe('SubscriptionGuard', () => {
  const req = { user: { id: 'user-1', activeOrganizationId: 'org-left' } }
  const context = {} as ExecutionContext

  beforeEach(() => {
    jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue({ getContext: () => ({ req }) } as never)
  })

  afterEach(() => jest.restoreAllMocks())

  function guardWith(organizationContext: unknown, subscription: unknown) {
    const prisma = { subscription: { findUnique: jest.fn().mockResolvedValue(subscription) } }
    const organizationContextService = { attach: jest.fn().mockResolvedValue(organizationContext) }
    return {
      prisma,
      organizationContextService,
      guard: new SubscriptionGuard(prisma as never, organizationContextService as never),
    }
  }

  it('refuses when the active organization is not a current membership', async () => {
    const { guard, prisma } = guardWith(undefined, { status: 'ACTIVE' })

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException)
    // The raw activeOrganizationId is never used to look anything up.
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled()
  })

  it("checks the membership-checked organization's subscription", async () => {
    const { guard, prisma, organizationContextService } = guardWith(
      { organizationId: 'org-1', userId: 'user-1' },
      { status: 'ACTIVE', cancelAtPeriodEnd: false },
    )

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(organizationContextService.attach).toHaveBeenCalledWith(req)
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      include: { plan: true },
    })
  })
})
