import { Injectable, UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { User, UserPreference } from '@nestled-template/api/core/models'
import { CtxUser, GqlAuthGuard } from '@nestled-template/api/utils'
import { SecureCreateUserPreferenceInput, SecureUpdateUserPreferenceInput } from './dto'
import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedUserPreferenceResolver } from '@nestled-template/api/generated-crud/feature'
import { UserPreferenceService } from './user-preference.service'

@Resolver(() => UserPreference)
@Injectable()
export class UserPreferenceResolver extends GeneratedUserPreferenceResolver {
  constructor(
    private readonly customService: UserPreferenceService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }

  // Custom user-specific operations with different names to avoid conflicts

  // Create with userId from context (no client-provided userId)
  @Mutation(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async userCreateUserPreference(
    @Args('input') input: SecureCreateUserPreferenceInput,
    @CtxUser() user: User,
  ): Promise<UserPreference> {
    return this.customService.userCreateUserPreference(user.id, input)
  }

  // Update - ensure user can only update their own preferences
  @Mutation(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async userUpdateUserPreference(
    @Args('userPreferenceId') userPreferenceId: string,
    @Args('input') input: SecureUpdateUserPreferenceInput,
    @CtxUser() user: User,
  ): Promise<UserPreference> {
    return this.customService.userUpdateUserPreference(user.id, userPreferenceId, input)
  }

  // Delete - ensure user can only delete their own preferences
  @Mutation(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async userDeleteUserPreference(
    @Args('userPreferenceId') userPreferenceId: string,
    @CtxUser() user: User,
  ): Promise<UserPreference> {
    return this.customService.userDeleteUserPreference(user.id, userPreferenceId)
  }

  // Read one - ensure user can only read their own preferences
  @Query(() => UserPreference, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async userGetUserPreference(
    @Args('userPreferenceId') userPreferenceId: string,
    @CtxUser() user: User,
  ): Promise<UserPreference | null> {
    return this.customService.userGetUserPreference(user.id, userPreferenceId)
  }

  // Read many - automatically filter to user's own preferences
  @Query(() => [UserPreference], { nullable: true })
  @UseGuards(GqlAuthGuard)
  async userGetUserPreferences(@CtxUser() user: User): Promise<UserPreference[]> {
    return this.customService.userGetUserPreferences(user.id)
  }
}