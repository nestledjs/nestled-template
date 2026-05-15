import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { PasswordHistory } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreatePasswordHistoryInput,
  ListPasswordHistoryInput,
  UpdatePasswordHistoryInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => PasswordHistory)
export class GeneratedPasswordHistoryResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [PasswordHistory], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  passwordHistories(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListPasswordHistoryInput, nullable: true })
    input?: ListPasswordHistoryInput,
  ) {
    return this.generatedService.passwordHistories(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  passwordHistoriesCount(
    @Args({ name: 'input', type: () => ListPasswordHistoryInput, nullable: true })
    input?: ListPasswordHistoryInput,
  ) {
    return this.generatedService.passwordHistoriesCount(input)
  }

  @Query(() => PasswordHistory, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  passwordHistory(
    @Info() info: GraphQLResolveInfo,
    @Args('passwordHistoryId') passwordHistoryId: string,
  ) {
    return this.generatedService.passwordHistory(info, passwordHistoryId)
  }

  @Mutation(() => PasswordHistory, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createPasswordHistory(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreatePasswordHistoryInput,
  ) {
    return this.generatedService.createPasswordHistory(info, input)
  }

  @Mutation(() => PasswordHistory, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updatePasswordHistory(
    @Info() info: GraphQLResolveInfo,
    @Args('passwordHistoryId') passwordHistoryId: string,
    @Args('input') input: UpdatePasswordHistoryInput,
  ) {
    return this.generatedService.updatePasswordHistory(info, passwordHistoryId, input)
  }

  @Mutation(() => PasswordHistory, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deletePasswordHistory(@Args('passwordHistoryId') passwordHistoryId: string) {
    return this.generatedService.deletePasswordHistory(passwordHistoryId)
  }
}
