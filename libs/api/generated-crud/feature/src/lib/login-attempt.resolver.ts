import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { LoginAttempt } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateLoginAttemptInput,
  ListLoginAttemptInput,
  UpdateLoginAttemptInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => LoginAttempt)
export class GeneratedLoginAttemptResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [LoginAttempt], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  loginAttempts(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListLoginAttemptInput, nullable: true })
    input?: ListLoginAttemptInput,
  ) {
    return this.generatedService.loginAttempts(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  loginAttemptsCount(
    @Args({ name: 'input', type: () => ListLoginAttemptInput, nullable: true })
    input?: ListLoginAttemptInput,
  ) {
    return this.generatedService.loginAttemptsCount(input)
  }

  @Query(() => LoginAttempt, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  loginAttempt(@Info() info: GraphQLResolveInfo, @Args('loginAttemptId') loginAttemptId: string) {
    return this.generatedService.loginAttempt(info, loginAttemptId)
  }

  @Mutation(() => LoginAttempt, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createLoginAttempt(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateLoginAttemptInput,
  ) {
    return this.generatedService.createLoginAttempt(info, input)
  }

  @Mutation(() => LoginAttempt, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateLoginAttempt(
    @Info() info: GraphQLResolveInfo,
    @Args('loginAttemptId') loginAttemptId: string,
    @Args('input') input: UpdateLoginAttemptInput,
  ) {
    return this.generatedService.updateLoginAttempt(info, loginAttemptId, input)
  }

  @Mutation(() => LoginAttempt, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteLoginAttempt(@Args('loginAttemptId') loginAttemptId: string) {
    return this.generatedService.deleteLoginAttempt(loginAttemptId)
  }
}
