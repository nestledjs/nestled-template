import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { OrganizationMember } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateOrganizationMemberInput,
  ListOrganizationMemberInput,
  UpdateOrganizationMemberInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => OrganizationMember)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedOrganizationMemberResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [OrganizationMember], { nullable: true })
  organizationMembers(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListOrganizationMemberInput, nullable: true })
    input?: ListOrganizationMemberInput,
  ) {
    return this.generatedService.organizationMembers(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  organizationMembersCount(
    @Args({ name: 'input', type: () => ListOrganizationMemberInput, nullable: true })
    input?: ListOrganizationMemberInput,
  ) {
    return this.generatedService.organizationMembersCount(input)
  }

  @Query(() => OrganizationMember, { nullable: true })
  organizationMember(
    @Info() info: GraphQLResolveInfo,
    @Args('organizationMemberId') organizationMemberId: string,
  ) {
    return this.generatedService.organizationMember(info, organizationMemberId)
  }

  @Mutation(() => OrganizationMember, { nullable: true })
  createOrganizationMember(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateOrganizationMemberInput,
  ) {
    return this.generatedService.createOrganizationMember(info, input)
  }

  @Mutation(() => OrganizationMember, { nullable: true })
  updateOrganizationMember(
    @Info() info: GraphQLResolveInfo,
    @Args('organizationMemberId') organizationMemberId: string,
    @Args('input') input: UpdateOrganizationMemberInput,
  ) {
    return this.generatedService.updateOrganizationMember(info, organizationMemberId, input)
  }

  @Mutation(() => OrganizationMember, { nullable: true })
  deleteOrganizationMember(@Args('organizationMemberId') organizationMemberId: string) {
    return this.generatedService.deleteOrganizationMember(organizationMemberId)
  }
}
