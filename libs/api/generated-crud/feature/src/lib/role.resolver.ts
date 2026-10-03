import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Role } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateRoleInput,
  ListRoleInput,
  UpdateRoleInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => Role)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedRoleResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Role], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  roles(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListRoleInput, nullable: true }) input?: ListRoleInput,
  ) {
    return this.generatedService.roles(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  rolesCount(
    @Args({ name: 'input', type: () => ListRoleInput, nullable: true }) input?: ListRoleInput,
  ) {
    return this.generatedService.rolesCount(input)
  }

  @Query(() => Role, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  role(@Info() info: GraphQLResolveInfo, @Args('roleId') roleId: string) {
    return this.generatedService.role(info, roleId)
  }

  @Mutation(() => Role, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createRole(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateRoleInput) {
    return this.generatedService.createRole(info, input)
  }

  @Mutation(() => Role, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateRole(
    @Info() info: GraphQLResolveInfo,
    @Args('roleId') roleId: string,
    @Args('input') input: UpdateRoleInput,
  ) {
    return this.generatedService.updateRole(info, roleId, input)
  }

  @Mutation(() => Role, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteRole(@Args('roleId') roleId: string) {
    return this.generatedService.deleteRole(roleId)
  }
}
