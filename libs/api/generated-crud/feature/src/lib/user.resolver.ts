import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateUserInput,
  ListUserInput,
  UpdateUserInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => User)
export class GeneratedUserResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [User], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  users(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListUserInput, nullable: true }) input?: ListUserInput,
  ) {
    return this.generatedService.users(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  usersCount(
    @Args({ name: 'input', type: () => ListUserInput, nullable: true }) input?: ListUserInput,
  ) {
    return this.generatedService.usersCount(input)
  }

  @Query(() => User, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  user(@Info() info: GraphQLResolveInfo, @Args('userId') userId: string) {
    return this.generatedService.user(info, userId)
  }

  @Mutation(() => User, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createUser(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateUserInput) {
    return this.generatedService.createUser(info, input)
  }

  @Mutation(() => User, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateUser(
    @Info() info: GraphQLResolveInfo,
    @Args('userId') userId: string,
    @Args('input') input: UpdateUserInput,
  ) {
    return this.generatedService.updateUser(info, userId, input)
  }

  @Mutation(() => User, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteUser(@Args('userId') userId: string) {
    return this.generatedService.deleteUser(userId)
  }
}
