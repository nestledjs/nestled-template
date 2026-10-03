import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  Authenticated,
  CtxUser,
  GqlAuthGuard,
  RequirePlatformPermission,
} from '@nestled-template/api/utils'
import { UseGuards } from '@nestjs/common'
import { User } from '@nestled-template/api/core/models'
import {
  CreatePlatformAccessRoleInput,
  PlatformAccessPrincipalPage,
  PlatformAccessRole,
  PlatformAccessRoleAssignmentInput,
  PlatformAccessSnapshot,
  UpdatePlatformAccessRoleInput,
} from './access-control.dto'
import { PlatformAccessControlService } from './access-control.service'

@Resolver()
export class PlatformAccessControlResolver {
  constructor(private readonly accessControl: PlatformAccessControlService) {}

  @Query(() => [String])
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  myPlatformPermissions(@CtxUser() user: User): Promise<readonly string[]> {
    if (user.isSuperAdmin) return Promise.resolve(['platform.*'])
    return this.accessControl.getUserPlatformPermissions(user.id)
  }

  @Query(() => PlatformAccessSnapshot)
  @RequirePlatformPermission('platform.access-control.read', 'platform.access-control.manage')
  platformAccessControl(): Promise<PlatformAccessSnapshot> {
    return this.accessControl.getSnapshot()
  }

  @Query(() => PlatformAccessPrincipalPage)
  @RequirePlatformPermission('platform.access-control.read', 'platform.access-control.manage')
  platformAccessControlPrincipals(
    @Args('search', { nullable: true }) search?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<PlatformAccessPrincipalPage> {
    return this.accessControl.searchPrincipals(search, skip, take)
  }

  @Mutation(() => PlatformAccessRole)
  @RequirePlatformPermission('platform.access-control.manage')
  createPlatformAccessRole(
    @CtxUser() actor: User,
    @Args('input') input: CreatePlatformAccessRoleInput,
  ): Promise<PlatformAccessRole> {
    return this.accessControl.createRole(actor, input)
  }

  @Mutation(() => PlatformAccessRole)
  @RequirePlatformPermission('platform.access-control.manage')
  updatePlatformAccessRole(
    @CtxUser() actor: User,
    @Args('input') input: UpdatePlatformAccessRoleInput,
  ): Promise<PlatformAccessRole> {
    return this.accessControl.updateRole(actor, input)
  }

  @Mutation(() => Boolean)
  @RequirePlatformPermission('platform.access-control.manage')
  deletePlatformAccessRole(
    @CtxUser() actor: User,
    @Args('roleId') roleId: string,
  ): Promise<boolean> {
    return this.accessControl.deleteRole(actor, roleId)
  }

  @Mutation(() => PlatformAccessRole)
  @RequirePlatformPermission('platform.access-control.manage')
  assignPlatformAccessRole(
    @CtxUser() actor: User,
    @Args('input') input: PlatformAccessRoleAssignmentInput,
  ): Promise<PlatformAccessRole> {
    return this.accessControl.assignRole(actor, input.roleId, input.userId)
  }

  @Mutation(() => PlatformAccessRole)
  @RequirePlatformPermission('platform.access-control.manage')
  revokePlatformAccessRole(
    @CtxUser() actor: User,
    @Args('input') input: PlatformAccessRoleAssignmentInput,
  ): Promise<PlatformAccessRole> {
    return this.accessControl.revokeRole(actor, input.roleId, input.userId)
  }
}
