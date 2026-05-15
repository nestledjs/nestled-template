import { Resolver, Query } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { GqlAuthGuard, CtxUser } from '@nestled-template/api/utils'
import { Plan, User } from '@nestled-template/api/core/models'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

/**
 * User Plan Resolver
 *
 * Provides user-facing queries for viewing available plans.
 * This is separate from the generated admin Plan resolver.
 */
@Resolver(() => Plan)
@UseGuards(GqlAuthGuard)
export class UserPlanResolver {
  constructor(private readonly prisma: ApiCoreDataAccessService) {}

  /**
   * Get all active plans available for purchase
   */
  @Query(() => [Plan])
  async availablePlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    })
  }

  /**
   * Get the current organization's plan
   */
  @Query(() => Plan, { nullable: true })
  async currentPlan(@CtxUser() user: User): Promise<Plan | null> {
    if (!user.activeOrganizationId) {
      return null
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: user.activeOrganizationId },
      include: { plan: true },
    })

    return subscription?.plan || null
  }
}
