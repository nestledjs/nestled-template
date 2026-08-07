import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
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
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedPermissionResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Permission], { nullable: true })
  permissions(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListPermissionInput, nullable: true })
    input?: ListPermissionInput,
  ) {
    return this.generatedService.permissions(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  permissionsCount(
    @Args({ name: 'input', type: () => ListPermissionInput, nullable: true })
    input?: ListPermissionInput,
  ) {
    return this.generatedService.permissionsCount(input)
  }

  @Query(() => Permission, { nullable: true })
  permission(@Info() info: GraphQLResolveInfo, @Args('permissionId') permissionId: string) {
    return this.generatedService.permission(info, permissionId)
  }

  @Mutation(() => Permission, { nullable: true })
  createPermission(@Info() info: GraphQLResolveInfo, @Args('input') input: CreatePermissionInput) {
    return this.generatedService.createPermission(info, input)
  }

  @Mutation(() => Permission, { nullable: true })
  updatePermission(
    @Info() info: GraphQLResolveInfo,
    @Args('permissionId') permissionId: string,
    @Args('input') input: UpdatePermissionInput,
  ) {
    return this.generatedService.updatePermission(info, permissionId, input)
  }

  @Mutation(() => Permission, { nullable: true })
  deletePermission(@Args('permissionId') permissionId: string) {
    return this.generatedService.deletePermission(permissionId)
  }
}
