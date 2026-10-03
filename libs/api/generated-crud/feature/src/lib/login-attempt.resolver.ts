import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { LoginAttempt } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateLoginAttemptInput,
  ListLoginAttemptInput,
  UpdateLoginAttemptInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => LoginAttempt)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedLoginAttemptResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [LoginAttempt], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  loginAttempts(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListLoginAttemptInput, nullable: true })
    input?: ListLoginAttemptInput,
  ) {
    return this.generatedService.loginAttempts(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  loginAttemptsCount(
    @Args({ name: 'input', type: () => ListLoginAttemptInput, nullable: true })
    input?: ListLoginAttemptInput,
  ) {
    return this.generatedService.loginAttemptsCount(input)
  }

  @Query(() => LoginAttempt, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  loginAttempt(@Info() info: GraphQLResolveInfo, @Args('loginAttemptId') loginAttemptId: string) {
    return this.generatedService.loginAttempt(info, loginAttemptId)
  }

  @Mutation(() => LoginAttempt, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createLoginAttempt(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateLoginAttemptInput,
  ) {
    return this.generatedService.createLoginAttempt(info, input)
  }

  @Mutation(() => LoginAttempt, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateLoginAttempt(
    @Info() info: GraphQLResolveInfo,
    @Args('loginAttemptId') loginAttemptId: string,
    @Args('input') input: UpdateLoginAttemptInput,
  ) {
    return this.generatedService.updateLoginAttempt(info, loginAttemptId, input)
  }

  @Mutation(() => LoginAttempt, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteLoginAttempt(@Args('loginAttemptId') loginAttemptId: string) {
    return this.generatedService.deleteLoginAttempt(loginAttemptId)
  }
}
