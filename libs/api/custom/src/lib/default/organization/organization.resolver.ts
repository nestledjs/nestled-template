import { Args, Mutation, Query, ResolveField, Resolver, Parent } from '@nestjs/graphql'
import { UseGuards, Injectable } from '@nestjs/common'
import {
  Authenticated,
  CtxOrganizationId,
  CtxUser,
  GqlAuthGuard,
  GqlOrganizationScopedGuard,
  Public,
  RequireOrganizationPermission,
} from '@nestled-template/api/utils'
import {
  Organization,
  User,
  OrganizationMember,
  Invite,
  Role,
} from '@nestled-template/api/core/models'
import { OrganizationService } from './organization.service'
import {
  AddOrganizationMemberInput,
  RemoveOrganizationMemberInput,
  UpdateMemberRoleInput,
  CreateInvitationInput,
  ResendInvitationInput,
  CancelInvitationInput,
  AcceptInvitationInput,
  RejectInvitationInput,
  SwitchOrganizationInput,
  TransferOrganizationOwnershipInput,
  InvitationDetails,
  UserCreateOrganizationInput,
  UserUpdateOrganizationInput,
  CreateOrganizationRoleInput,
  UpdateOrganizationRoleInput,
  DeleteOrganizationRoleInput,
} from './dto'

@Resolver(() => Organization)
@Injectable()
export class OrganizationResolver {
  constructor(private readonly customService: OrganizationService) {}

  // Custom user-specific Organization operations

  @Mutation(() => Organization)
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async userCreateOrganization(
    @CtxUser() user: User,
    @Args('input') input: UserCreateOrganizationInput,
  ): Promise<Organization> {
    return this.customService.userCreateOrganization(user.id, input)
  }

  @Mutation(() => Organization)
  @RequireOrganizationPermission(['organization:update'])
  @UseGuards(GqlOrganizationScopedGuard)
  async userUpdateOrganization(
    @CtxUser() user: User,
    @CtxOrganizationId() organizationId: string,
    @Args('input') input: UserUpdateOrganizationInput,
  ): Promise<Organization> {
    return this.customService.userUpdateOrganization(user.id, organizationId, input)
  }

  @Mutation(() => Boolean)
  @RequireOrganizationPermission(['organization:delete'], {
    organizationIdPath: 'organizationId',
  })
  async userDeleteOrganization(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string,
  ): Promise<boolean> {
    return this.customService.userDeleteOrganization(user.id, organizationId)
  }

  // Member Management

  @Mutation(() => Boolean)
  @RequireOrganizationPermission(['member:invite'], {
    organizationIdPath: 'input.organizationId',
  })
  async addOrganizationMember(
    @CtxUser() user: User,
    @Args('input') input: AddOrganizationMemberInput,
  ): Promise<boolean> {
    return this.customService.addOrganizationMember(user.id, input)
  }

  @Mutation(() => Boolean)
  @RequireOrganizationPermission(['member:remove'], {
    organizationIdPath: 'input.organizationId',
  })
  async removeOrganizationMember(
    @CtxUser() user: User,
    @Args('input') input: RemoveOrganizationMemberInput,
  ): Promise<boolean> {
    return this.customService.removeOrganizationMember(user.id, input)
  }

  @Mutation(() => Boolean)
  @RequireOrganizationPermission(['member:update'], {
    organizationIdPath: 'input.organizationId',
  })
  async updateOrganizationMemberRole(
    @CtxUser() user: User,
    @Args('input') input: UpdateMemberRoleInput,
  ): Promise<boolean> {
    return this.customService.updateOrganizationMemberRole(user.id, input)
  }

  // Invitation Management

  @Mutation(() => String)
  @RequireOrganizationPermission(['member:invite'], {
    organizationIdPath: 'input.organizationId',
  })
  async createOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: CreateInvitationInput,
  ): Promise<string> {
    return this.customService.createOrganizationInvitation(user.id, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async resendOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: ResendInvitationInput,
  ): Promise<boolean> {
    return this.customService.resendOrganizationInvitation(user.id, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async cancelOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: CancelInvitationInput,
  ): Promise<boolean> {
    return this.customService.cancelOrganizationInvitation(user.id, input)
  }

  @Mutation(() => Organization)
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async acceptOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: AcceptInvitationInput,
  ): Promise<Organization> {
    return this.customService.acceptOrganizationInvitation(user.id, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async rejectOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: RejectInvitationInput,
  ): Promise<boolean> {
    return this.customService.rejectOrganizationInvitation(user.id, input)
  }

  // Organization Switching

  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async switchActiveOrganization(
    @CtxUser() user: User,
    @Args('input') input: SwitchOrganizationInput,
  ): Promise<User> {
    return this.customService.switchActiveOrganization(user.id, input)
  }

  // Organization Ownership Transfer

  @Mutation(() => Boolean)
  @RequireOrganizationPermission(['organization:update'], {
    organizationIdPath: 'input.organizationId',
  })
  async transferOrganizationOwnership(
    @CtxUser() user: User,
    @Args('input') input: TransferOrganizationOwnershipInput,
  ): Promise<boolean> {
    return this.customService.transferOrganizationOwnership(user.id, input)
  }

  // Queries

  @Query(() => [Organization])
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async myOrganizations(@CtxUser() user: User): Promise<Organization[]> {
    return this.customService.getUserOrganizations(user.id)
  }

  @Query(() => [OrganizationMember])
  @RequireOrganizationPermission(['member:read'], {
    organizationIdPath: 'organizationId',
  })
  async userOrganizationMembers(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string,
  ) {
    return this.customService.getOrganizationMembers(user.id, organizationId)
  }

  @Query(() => [Invite])
  @RequireOrganizationPermission(['member:read'], {
    organizationIdPath: 'organizationId',
  })
  async organizationInvitations(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string,
  ) {
    return this.customService.getOrganizationInvitations(user.id, organizationId)
  }

  @Query(() => [Role])
  @RequireOrganizationPermission(['role:read'], { organizationIdPath: 'organizationId' })
  async organizationRoles(@CtxUser() user: User, @Args('organizationId') organizationId: string) {
    return this.customService.getOrganizationRoles(user.id, organizationId)
  }

  @Mutation(() => Role)
  @RequireOrganizationPermission(['role:create'], {
    organizationIdPath: 'input.organizationId',
  })
  async userCreateOrganizationRole(
    @CtxUser() user: User,
    @Args('input') input: CreateOrganizationRoleInput,
  ) {
    return this.customService.userCreateOrganizationRole(user.id, input)
  }

  @Mutation(() => Role)
  @RequireOrganizationPermission(['role:update'], {
    organizationIdPath: 'input.organizationId',
  })
  async userUpdateOrganizationRole(
    @CtxUser() user: User,
    @Args('input') input: UpdateOrganizationRoleInput,
  ) {
    return this.customService.userUpdateOrganizationRole(user.id, input)
  }

  @Mutation(() => Boolean)
  @RequireOrganizationPermission(['role:delete'], {
    organizationIdPath: 'input.organizationId',
  })
  async userDeleteOrganizationRole(
    @CtxUser() user: User,
    @Args('input') input: DeleteOrganizationRoleInput,
  ): Promise<boolean> {
    return this.customService.userDeleteOrganizationRole(user.id, input)
  }

  // Public queries (no authentication required)

  @Query(() => InvitationDetails)
  @Public()
  async getInvitationDetails(@Args('token') token: string): Promise<InvitationDetails> {
    return this.customService.getInvitationDetails(token)
  }

  // Field resolvers

  @ResolveField(() => [OrganizationMember], { nullable: true })
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async members(
    @Parent() organization: Organization,
    @CtxUser() user: User,
  ): Promise<OrganizationMember[]> {
    return this.customService.getOrganizationMembers(user.id, organization.id)
  }
}
