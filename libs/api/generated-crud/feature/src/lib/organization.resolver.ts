import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Organization } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateOrganizationInput,
  ListOrganizationInput,
  UpdateOrganizationInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => Organization)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedOrganizationResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Organization], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  organizations(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListOrganizationInput, nullable: true })
    input?: ListOrganizationInput,
  ) {
    return this.generatedService.organizations(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  organizationsCount(
    @Args({ name: 'input', type: () => ListOrganizationInput, nullable: true })
    input?: ListOrganizationInput,
  ) {
    return this.generatedService.organizationsCount(input)
  }

  @Query(() => Organization, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  organization(@Info() info: GraphQLResolveInfo, @Args('organizationId') organizationId: string) {
    return this.generatedService.organization(info, organizationId)
  }

  @Mutation(() => Organization, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createOrganization(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateOrganizationInput,
  ) {
    return this.generatedService.createOrganization(info, input)
  }

  @Mutation(() => Organization, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateOrganization(
    @Info() info: GraphQLResolveInfo,
    @Args('organizationId') organizationId: string,
    @Args('input') input: UpdateOrganizationInput,
  ) {
    return this.generatedService.updateOrganization(info, organizationId, input)
  }

  @Mutation(() => Organization, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteOrganization(@Args('organizationId') organizationId: string) {
    return this.generatedService.deleteOrganization(organizationId)
  }
}
