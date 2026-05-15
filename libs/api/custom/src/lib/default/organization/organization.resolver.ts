import { Args, Mutation, Query, ResolveField, Resolver, Parent } from '@nestjs/graphql'
import { UseGuards, Injectable } from '@nestjs/common'
import { CtxUser, GqlAuthGuard } from '@nestled-template/api/utils'
import { Organization, User, OrganizationMember, Invite, Role } from '@nestled-template/api/core/models'
import { OrganizationService } from './organization.service'
import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedOrganizationResolver } from '@nestled-template/api/generated-crud/feature'
import {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AddOrganizationMemberInput,
  RemoveOrganizationMemberInput,
  UpdateMemberRoleInput,
  CreateInvitationInput,
  ResendInvitationInput,
  AcceptInvitationInput,
  RejectInvitationInput,
  SwitchOrganizationInput,
  TransferOrganizationOwnershipInput,
  InvitationDetails
} from './dto'

@Resolver(() => Organization)
@Injectable()
export class OrganizationResolver extends GeneratedOrganizationResolver {
  constructor(
    private readonly customService: OrganizationService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }

  // Custom user-specific Organization operations

  @Mutation(() => Organization)
  @UseGuards(GqlAuthGuard)
  async userCreateOrganization(
    @CtxUser() user: User,
    @Args('input') input: CreateOrganizationInput
  ): Promise<Organization> {
    return this.customService.userCreateOrganization(user.id, input)
  }

  @Mutation(() => Organization)
  @UseGuards(GqlAuthGuard)
  async userUpdateOrganization(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string,
    @Args('input') input: UpdateOrganizationInput
  ): Promise<Organization> {
    return this.customService.userUpdateOrganization(user.id, organizationId, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async userDeleteOrganization(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string
  ): Promise<boolean> {
    return this.customService.userDeleteOrganization(user.id, organizationId)
  }

  // Member Management

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async addOrganizationMember(
    @CtxUser() user: User,
    @Args('input') input: AddOrganizationMemberInput
  ): Promise<boolean> {
    return this.customService.addOrganizationMember(user.id, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async removeOrganizationMember(
    @CtxUser() user: User,
    @Args('input') input: RemoveOrganizationMemberInput
  ): Promise<boolean> {
    return this.customService.removeOrganizationMember(user.id, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async updateOrganizationMemberRole(
    @CtxUser() user: User,
    @Args('input') input: UpdateMemberRoleInput
  ): Promise<boolean> {
    return this.customService.updateOrganizationMemberRole(user.id, input)
  }

  // Invitation Management

  @Mutation(() => String)
  @UseGuards(GqlAuthGuard)
  async createOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: CreateInvitationInput
  ): Promise<string> {
    return this.customService.createOrganizationInvitation(user.id, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async resendOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: ResendInvitationInput
  ): Promise<boolean> {
    return this.customService.resendOrganizationInvitation(user.id, input)
  }

  @Mutation(() => Organization)
  @UseGuards(GqlAuthGuard)
  async acceptOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: AcceptInvitationInput
  ): Promise<Organization> {
    return this.customService.acceptOrganizationInvitation(user.id, input)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async rejectOrganizationInvitation(
    @CtxUser() user: User,
    @Args('input') input: RejectInvitationInput
  ): Promise<boolean> {
    return this.customService.rejectOrganizationInvitation(user.id, input)
  }

  // Organization Switching

  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  async switchActiveOrganization(
    @CtxUser() user: User,
    @Args('input') input: SwitchOrganizationInput
  ): Promise<User> {
    return this.customService.switchActiveOrganization(user.id, input)
  }

  // Organization Ownership Transfer

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async transferOrganizationOwnership(
    @CtxUser() user: User,
    @Args('input') input: TransferOrganizationOwnershipInput
  ): Promise<boolean> {
    return this.customService.transferOrganizationOwnership(user.id, input)
  }

  // Queries

  @Query(() => [Organization])
  @UseGuards(GqlAuthGuard)
  async myOrganizations(@CtxUser() user: User): Promise<Organization[]> {
    return this.customService.getUserOrganizations(user.id)
  }

  @Query(() => [OrganizationMember])
  @UseGuards(GqlAuthGuard)
  async userOrganizationMembers(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string
  ) {
    return this.customService.getOrganizationMembers(user.id, organizationId)
  }

  @Query(() => [Invite])
  @UseGuards(GqlAuthGuard)
  async organizationInvitations(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string
  ) {
    return this.customService.getOrganizationInvitations(user.id, organizationId)
  }

  @Query(() => [Role])
  @UseGuards(GqlAuthGuard)
  async organizationRoles(
    @CtxUser() user: User,
    @Args('organizationId') organizationId: string
  ) {
    return this.customService.getOrganizationRoles(user.id, organizationId)
  }

  // Public queries (no authentication required)

  @Query(() => InvitationDetails)
  async getInvitationDetails(@Args('token') token: string): Promise<InvitationDetails> {
    return this.customService.getInvitationDetails(token)
  }

  // Field resolvers

  @ResolveField(() => [OrganizationMember], { nullable: true })
  @UseGuards(GqlAuthGuard)
  async members(
    @Parent() organization: Organization,
    @CtxUser() user: User
  ): Promise<OrganizationMember[]> {
    return this.customService.getOrganizationMembers(user.id, organization.id)
  }
}