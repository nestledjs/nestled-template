import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { UserPreference } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateUserPreferenceInput,
  ListUserPreferenceInput,
  UpdateUserPreferenceInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard, GqlAuthGuard } from '@nestled-template/api/utils'

@Resolver(() => UserPreference)
export class GeneratedUserPreferenceResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [UserPreference], { nullable: true })
  @UseGuards(GqlAuthGuard)
  userPreferences(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListUserPreferenceInput, nullable: true })
    input?: ListUserPreferenceInput,
  ) {
    return this.generatedService.userPreferences(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  userPreferencesCount(
    @Args({ name: 'input', type: () => ListUserPreferenceInput, nullable: true })
    input?: ListUserPreferenceInput,
  ) {
    return this.generatedService.userPreferencesCount(input)
  }

  @Query(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  userPreference(
    @Info() info: GraphQLResolveInfo,
    @Args('userPreferenceId') userPreferenceId: string,
  ) {
    return this.generatedService.userPreference(info, userPreferenceId)
  }

  @Mutation(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  createUserPreference(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateUserPreferenceInput,
  ) {
    return this.generatedService.createUserPreference(info, input)
  }

  @Mutation(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  updateUserPreference(
    @Info() info: GraphQLResolveInfo,
    @Args('userPreferenceId') userPreferenceId: string,
    @Args('input') input: UpdateUserPreferenceInput,
  ) {
    return this.generatedService.updateUserPreference(info, userPreferenceId, input)
  }

  @Mutation(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  deleteUserPreference(@Args('userPreferenceId') userPreferenceId: string) {
    return this.generatedService.deleteUserPreference(userPreferenceId)
  }
}
