import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Subscription } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateSubscriptionInput,
  ListSubscriptionInput,
  UpdateSubscriptionInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Subscription)
export class GeneratedSubscriptionResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Subscription], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  subscriptions(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListSubscriptionInput, nullable: true })
    input?: ListSubscriptionInput,
  ) {
    return this.generatedService.subscriptions(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  subscriptionsCount(
    @Args({ name: 'input', type: () => ListSubscriptionInput, nullable: true })
    input?: ListSubscriptionInput,
  ) {
    return this.generatedService.subscriptionsCount(input)
  }

  @Query(() => Subscription, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  subscription(@Info() info: GraphQLResolveInfo, @Args('subscriptionId') subscriptionId: string) {
    return this.generatedService.subscription(info, subscriptionId)
  }

  @Mutation(() => Subscription, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createSubscription(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateSubscriptionInput,
  ) {
    return this.generatedService.createSubscription(info, input)
  }

  @Mutation(() => Subscription, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateSubscription(
    @Info() info: GraphQLResolveInfo,
    @Args('subscriptionId') subscriptionId: string,
    @Args('input') input: UpdateSubscriptionInput,
  ) {
    return this.generatedService.updateSubscription(info, subscriptionId, input)
  }

  @Mutation(() => Subscription, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteSubscription(@Args('subscriptionId') subscriptionId: string) {
    return this.generatedService.deleteSubscription(subscriptionId)
  }
}
