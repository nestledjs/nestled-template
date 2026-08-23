import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { User } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateUserInput,
  ListUserInput,
  UpdateUserInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => User)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedUserResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [User], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  users(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListUserInput, nullable: true }) input?: ListUserInput,
  ) {
    return this.generatedService.users(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  usersCount(
    @Args({ name: 'input', type: () => ListUserInput, nullable: true }) input?: ListUserInput,
  ) {
    return this.generatedService.usersCount(input)
  }

  @Query(() => User, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  user(@Info() info: GraphQLResolveInfo, @Args('userId') userId: string) {
    return this.generatedService.user(info, userId)
  }

  @Mutation(() => User, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createUser(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateUserInput) {
    return this.generatedService.createUser(info, input)
  }

  @Mutation(() => User, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateUser(
    @Info() info: GraphQLResolveInfo,
    @Args('userId') userId: string,
    @Args('input') input: UpdateUserInput,
  ) {
    return this.generatedService.updateUser(info, userId, input)
  }

  @Mutation(() => User, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteUser(@Args('userId') userId: string) {
    return this.generatedService.deleteUser(userId)
  }
}
