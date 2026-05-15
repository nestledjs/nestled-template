import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { SubscriptionStatus } from '@nestled-template/api/prisma'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

/**
 * Subscription Guard
 *
 * Protects GraphQL resolvers by requiring an active subscription.
 * Use this guard on resolvers that should only be accessible to paying customers.
 *
 * Usage:
 *   @UseGuards(GqlAuthGuard, SubscriptionGuard)
 *   @Query(() => ProtectedData)
 *   protectedQuery() { ... }
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: ApiCoreDataAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context)
    const { req } = ctx.getContext()

    const user = req.user
    if (!user) {
      throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED)
    }

    const activeOrganizationId = user.activeOrganizationId
    if (!activeOrganizationId) {
      throw new HttpException(
        'No active organization. Please select an organization.',
        HttpStatus.FORBIDDEN,
      )
    }

    // Get organization's subscription
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: activeOrganizationId },
      include: { plan: true },
    })

    if (!subscription) {
      throw new HttpException(
        'No subscription found. Please subscribe to a plan to access this feature.',
        HttpStatus.PAYMENT_REQUIRED,
      )
    }

    // Check subscription status
    const validStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ]

    if (!validStatuses.includes(subscription.status)) {
      // Check if there's a grace period for past_due subscriptions
      if (subscription.status === SubscriptionStatus.PAST_DUE) {
        const gracePeriodDays = 3
        const currentPeriodEnd = subscription.stripeCurrentPeriodEnd
        if (currentPeriodEnd) {
          const gracePeriodEnd = new Date(currentPeriodEnd)
          gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays)

          if (new Date() <= gracePeriodEnd) {
            // Still within grace period
            return true
          }
        }
      }

      throw new HttpException(
        `Subscription is ${subscription.status.toLowerCase()}. Please update your payment method.`,
        HttpStatus.PAYMENT_REQUIRED,
      )
    }

    // Check if subscription is canceled but still active until period end
    if (subscription.cancelAtPeriodEnd && subscription.stripeCurrentPeriodEnd) {
      const periodEnd = new Date(subscription.stripeCurrentPeriodEnd)
      if (new Date() > periodEnd) {
        throw new HttpException(
          'Subscription has expired. Please renew your subscription.',
          HttpStatus.PAYMENT_REQUIRED,
        )
      }
    }

    return true
  }
}
