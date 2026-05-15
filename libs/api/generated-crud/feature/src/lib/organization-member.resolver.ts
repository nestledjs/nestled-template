import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { OrganizationMember } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateOrganizationMemberInput,
  ListOrganizationMemberInput,
  UpdateOrganizationMemberInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => OrganizationMember)
export class GeneratedOrganizationMemberResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [OrganizationMember], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  organizationMembers(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListOrganizationMemberInput, nullable: true })
    input?: ListOrganizationMemberInput,
  ) {
    return this.generatedService.organizationMembers(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  organizationMembersCount(
    @Args({ name: 'input', type: () => ListOrganizationMemberInput, nullable: true })
    input?: ListOrganizationMemberInput,
  ) {
    return this.generatedService.organizationMembersCount(input)
  }

  @Query(() => OrganizationMember, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  organizationMember(
    @Info() info: GraphQLResolveInfo,
    @Args('organizationMemberId') organizationMemberId: string,
  ) {
    return this.generatedService.organizationMember(info, organizationMemberId)
  }

  @Mutation(() => OrganizationMember, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createOrganizationMember(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateOrganizationMemberInput,
  ) {
    return this.generatedService.createOrganizationMember(info, input)
  }

  @Mutation(() => OrganizationMember, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateOrganizationMember(
    @Info() info: GraphQLResolveInfo,
    @Args('organizationMemberId') organizationMemberId: string,
    @Args('input') input: UpdateOrganizationMemberInput,
  ) {
    return this.generatedService.updateOrganizationMember(info, organizationMemberId, input)
  }

  @Mutation(() => OrganizationMember, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteOrganizationMember(@Args('organizationMemberId') organizationMemberId: string) {
    return this.generatedService.deleteOrganizationMember(organizationMemberId)
  }
}
