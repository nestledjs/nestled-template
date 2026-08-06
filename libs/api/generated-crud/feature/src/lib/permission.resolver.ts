import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Permission } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreatePermissionInput,
  ListPermissionInput,
  UpdatePermissionInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Permission)
export class GeneratedPermissionResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Permission], { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  permissions(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListPermissionInput, nullable: true })
    input?: ListPermissionInput,
  ) {
    return this.generatedService.permissions(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  permissionsCount(
    @Args({ name: 'input', type: () => ListPermissionInput, nullable: true })
    input?: ListPermissionInput,
  ) {
    return this.generatedService.permissionsCount(input)
  }

  @Query(() => Permission, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  permission(@Info() info: GraphQLResolveInfo, @Args('permissionId') permissionId: string) {
    return this.generatedService.permission(info, permissionId)
  }

  @Mutation(() => Permission, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  createPermission(@Info() info: GraphQLResolveInfo, @Args('input') input: CreatePermissionInput) {
    return this.generatedService.createPermission(info, input)
  }

  @Mutation(() => Permission, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  updatePermission(
    @Info() info: GraphQLResolveInfo,
    @Args('permissionId') permissionId: string,
    @Args('input') input: UpdatePermissionInput,
  ) {
    return this.generatedService.updatePermission(info, permissionId, input)
  }

  @Mutation(() => Permission, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  deletePermission(@Args('permissionId') permissionId: string) {
    return this.generatedService.deletePermission(permissionId)
  }
}
