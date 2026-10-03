import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Invite } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateInviteInput,
  ListInviteInput,
  UpdateInviteInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => Invite)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedInviteResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Invite], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  invites(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListInviteInput, nullable: true }) input?: ListInviteInput,
  ) {
    return this.generatedService.invites(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  invitesCount(
    @Args({ name: 'input', type: () => ListInviteInput, nullable: true }) input?: ListInviteInput,
  ) {
    return this.generatedService.invitesCount(input)
  }

  @Query(() => Invite, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  invite(@Info() info: GraphQLResolveInfo, @Args('inviteId') inviteId: string) {
    return this.generatedService.invite(info, inviteId)
  }

  @Mutation(() => Invite, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createInvite(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateInviteInput) {
    return this.generatedService.createInvite(info, input)
  }

  @Mutation(() => Invite, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateInvite(
    @Info() info: GraphQLResolveInfo,
    @Args('inviteId') inviteId: string,
    @Args('input') input: UpdateInviteInput,
  ) {
    return this.generatedService.updateInvite(info, inviteId, input)
  }

  @Mutation(() => Invite, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteInvite(@Args('inviteId') inviteId: string) {
    return this.generatedService.deleteInvite(inviteId)
  }
}
