import { AUTH_LEVEL_KEY } from '@nestled-template/api/utils'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import { UserPlanResolver } from './user-plan.resolver'

type DataMock = {
  plan: {
    findMany: jest.Mock
  }
  subscription: {
    findUnique: jest.Mock
  }
}

const createDataMock = (): DataMock & ApiCoreDataAccessService =>
  Object.assign(Object.create(ApiCoreDataAccessService.prototype), {
    plan: { findMany: jest.fn() },
    subscription: { findUnique: jest.fn() },
  })

describe('UserPlanResolver', () => {
  let data: DataMock & ApiCoreDataAccessService
  let resolver: UserPlanResolver

  beforeEach(() => {
    data = createDataMock()
    resolver = new UserPlanResolver(data)
  })

  it('publishes only active plans through the public pricing query', async () => {
    const plans = [{ id: 'plan-1', active: true }]
    data.plan.findMany.mockResolvedValue(plans)

    await expect(resolver.availablePlans()).resolves.toBe(plans)

    expect(data.plan.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { price: 'asc' },
    })
    expect(Reflect.getMetadata(AUTH_LEVEL_KEY, resolver.availablePlans)).toBe('public')
  })

  it('keeps organization plan lookup authenticated and scoped to the current user', async () => {
    const user = Object.assign(new User(), { id: 'user-1', activeOrganizationId: 'org-1' })
    data.subscription.findUnique.mockResolvedValue({ plan: { id: 'plan-1' } })

    await expect(resolver.currentPlan(user)).resolves.toEqual({ id: 'plan-1' })

    expect(data.subscription.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      include: { plan: true },
    })
    expect(Reflect.getMetadata(AUTH_LEVEL_KEY, resolver.currentPlan)).toBe('authenticated')
  })
})
