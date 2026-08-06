import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Team } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateTeamInput,
  ListTeamInput,
  UpdateTeamInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Team)
export class GeneratedTeamResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Team], { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  teams(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListTeamInput, nullable: true }) input?: ListTeamInput,
  ) {
    return this.generatedService.teams(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  teamsCount(
    @Args({ name: 'input', type: () => ListTeamInput, nullable: true }) input?: ListTeamInput,
  ) {
    return this.generatedService.teamsCount(input)
  }

  @Query(() => Team, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  team(@Info() info: GraphQLResolveInfo, @Args('teamId') teamId: string) {
    return this.generatedService.team(info, teamId)
  }

  @Mutation(() => Team, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  createTeam(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateTeamInput) {
    return this.generatedService.createTeam(info, input)
  }

  @Mutation(() => Team, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  updateTeam(
    @Info() info: GraphQLResolveInfo,
    @Args('teamId') teamId: string,
    @Args('input') input: UpdateTeamInput,
  ) {
    return this.generatedService.updateTeam(info, teamId, input)
  }

  @Mutation(() => Team, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  deleteTeam(@Args('teamId') teamId: string) {
    return this.generatedService.deleteTeam(teamId)
  }
}
