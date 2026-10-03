import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { UserSession } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateUserSessionInput,
  ListUserSessionInput,
  UpdateUserSessionInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => UserSession)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedUserSessionResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [UserSession], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  userSessions(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListUserSessionInput, nullable: true })
    input?: ListUserSessionInput,
  ) {
    return this.generatedService.userSessions(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  userSessionsCount(
    @Args({ name: 'input', type: () => ListUserSessionInput, nullable: true })
    input?: ListUserSessionInput,
  ) {
    return this.generatedService.userSessionsCount(input)
  }

  @Query(() => UserSession, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  userSession(@Info() info: GraphQLResolveInfo, @Args('userSessionId') userSessionId: string) {
    return this.generatedService.userSession(info, userSessionId)
  }

  @Mutation(() => UserSession, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createUserSession(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateUserSessionInput,
  ) {
    return this.generatedService.createUserSession(info, input)
  }

  @Mutation(() => UserSession, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateUserSession(
    @Info() info: GraphQLResolveInfo,
    @Args('userSessionId') userSessionId: string,
    @Args('input') input: UpdateUserSessionInput,
  ) {
    return this.generatedService.updateUserSession(info, userSessionId, input)
  }

  @Mutation(() => UserSession, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteUserSession(@Args('userSessionId') userSessionId: string) {
    return this.generatedService.deleteUserSession(userSessionId)
  }
}
