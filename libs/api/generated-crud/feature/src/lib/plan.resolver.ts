import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Plan } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreatePlanInput,
  ListPlanInput,
  UpdatePlanInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Plan)
export class GeneratedPlanResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Plan], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  plans(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListPlanInput, nullable: true }) input?: ListPlanInput,
  ) {
    return this.generatedService.plans(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  plansCount(
    @Args({ name: 'input', type: () => ListPlanInput, nullable: true }) input?: ListPlanInput,
  ) {
    return this.generatedService.plansCount(input)
  }

  @Query(() => Plan, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  plan(@Info() info: GraphQLResolveInfo, @Args('planId') planId: string) {
    return this.generatedService.plan(info, planId)
  }

  @Mutation(() => Plan, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createPlan(@Info() info: GraphQLResolveInfo, @Args('input') input: CreatePlanInput) {
    return this.generatedService.createPlan(info, input)
  }

  @Mutation(() => Plan, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updatePlan(
    @Info() info: GraphQLResolveInfo,
    @Args('planId') planId: string,
    @Args('input') input: UpdatePlanInput,
  ) {
    return this.generatedService.updatePlan(info, planId, input)
  }

  @Mutation(() => Plan, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deletePlan(@Args('planId') planId: string) {
    return this.generatedService.deletePlan(planId)
  }
}
