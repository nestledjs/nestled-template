import { Resolver, Query } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import {
  Authenticated,
  CtxOptionalOrganizationId,
  GqlAuthGuard,
  Public,
} from '@nestled-template/api/utils'
import { Plan } from '@nestled-template/api/core/models'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

/**
 * User Plan Resolver
 *
 * Provides user-facing queries for viewing available plans.
 * This is separate from the generated admin Plan resolver.
 */
@Resolver(() => Plan)
export class UserPlanResolver {
  constructor(private readonly prisma: ApiCoreDataAccessService) {}

  /**
   * Get all active plans available for purchase
   */
  @Query(() => [Plan])
  @Public()
  async availablePlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    })
  }

  /**
   * Get the current organization's plan.
   *
   * Any member may read it (it is what feature gating needs), but only for an organization they are
   * a member of: the organization comes from the context GqlAuthGuard attached after checking the
   * membership, never from the raw `user.activeOrganizationId`.
   */
  @Query(() => Plan, { nullable: true })
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async currentPlan(
    @CtxOptionalOrganizationId() organizationId: string | null,
  ): Promise<Plan | null> {
    if (!organizationId) {
      return null
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    return subscription?.plan || null
  }
}
