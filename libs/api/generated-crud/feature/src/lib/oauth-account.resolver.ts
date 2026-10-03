import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { OAuthAccount } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateOAuthAccountInput,
  ListOAuthAccountInput,
  UpdateOAuthAccountInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => OAuthAccount)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedOAuthAccountResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [OAuthAccount], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  oAuthAccounts(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListOAuthAccountInput, nullable: true })
    input?: ListOAuthAccountInput,
  ) {
    return this.generatedService.oAuthAccounts(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  oAuthAccountsCount(
    @Args({ name: 'input', type: () => ListOAuthAccountInput, nullable: true })
    input?: ListOAuthAccountInput,
  ) {
    return this.generatedService.oAuthAccountsCount(input)
  }

  @Query(() => OAuthAccount, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  oAuthAccount(@Info() info: GraphQLResolveInfo, @Args('oAuthAccountId') oAuthAccountId: string) {
    return this.generatedService.oAuthAccount(info, oAuthAccountId)
  }

  @Mutation(() => OAuthAccount, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createOAuthAccount(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateOAuthAccountInput,
  ) {
    return this.generatedService.createOAuthAccount(info, input)
  }

  @Mutation(() => OAuthAccount, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateOAuthAccount(
    @Info() info: GraphQLResolveInfo,
    @Args('oAuthAccountId') oAuthAccountId: string,
    @Args('input') input: UpdateOAuthAccountInput,
  ) {
    return this.generatedService.updateOAuthAccount(info, oAuthAccountId, input)
  }

  @Mutation(() => OAuthAccount, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteOAuthAccount(@Args('oAuthAccountId') oAuthAccountId: string) {
    return this.generatedService.deleteOAuthAccount(oAuthAccountId)
  }
}
