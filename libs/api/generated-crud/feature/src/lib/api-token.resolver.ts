import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { ApiToken } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateApiTokenInput,
  ListApiTokenInput,
  UpdateApiTokenInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => ApiToken)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedApiTokenResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [ApiToken], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  apiTokens(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListApiTokenInput, nullable: true })
    input?: ListApiTokenInput,
  ) {
    return this.generatedService.apiTokens(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  apiTokensCount(
    @Args({ name: 'input', type: () => ListApiTokenInput, nullable: true })
    input?: ListApiTokenInput,
  ) {
    return this.generatedService.apiTokensCount(input)
  }

  @Query(() => ApiToken, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  apiToken(@Info() info: GraphQLResolveInfo, @Args('apiTokenId') apiTokenId: string) {
    return this.generatedService.apiToken(info, apiTokenId)
  }

  @Mutation(() => ApiToken, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createApiToken(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateApiTokenInput) {
    return this.generatedService.createApiToken(info, input)
  }

  @Mutation(() => ApiToken, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateApiToken(
    @Info() info: GraphQLResolveInfo,
    @Args('apiTokenId') apiTokenId: string,
    @Args('input') input: UpdateApiTokenInput,
  ) {
    return this.generatedService.updateApiToken(info, apiTokenId, input)
  }

  @Mutation(() => ApiToken, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteApiToken(@Args('apiTokenId') apiTokenId: string) {
    return this.generatedService.deleteApiToken(apiTokenId)
  }
}
