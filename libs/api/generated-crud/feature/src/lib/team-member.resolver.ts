import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { TeamMember } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateTeamMemberInput,
  ListTeamMemberInput,
  UpdateTeamMemberInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => TeamMember)
export class GeneratedTeamMemberResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [TeamMember], { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  teamMembers(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListTeamMemberInput, nullable: true })
    input?: ListTeamMemberInput,
  ) {
    return this.generatedService.teamMembers(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  teamMembersCount(
    @Args({ name: 'input', type: () => ListTeamMemberInput, nullable: true })
    input?: ListTeamMemberInput,
  ) {
    return this.generatedService.teamMembersCount(input)
  }

  @Query(() => TeamMember, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  teamMember(@Info() info: GraphQLResolveInfo, @Args('teamMemberId') teamMemberId: string) {
    return this.generatedService.teamMember(info, teamMemberId)
  }

  @Mutation(() => TeamMember, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  createTeamMember(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateTeamMemberInput) {
    return this.generatedService.createTeamMember(info, input)
  }

  @Mutation(() => TeamMember, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  updateTeamMember(
    @Info() info: GraphQLResolveInfo,
    @Args('teamMemberId') teamMemberId: string,
    @Args('input') input: UpdateTeamMemberInput,
  ) {
    return this.generatedService.updateTeamMember(info, teamMemberId, input)
  }

  @Mutation(() => TeamMember, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  deleteTeamMember(@Args('teamMemberId') teamMemberId: string) {
    return this.generatedService.deleteTeamMember(teamMemberId)
  }
}
