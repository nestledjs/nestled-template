import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
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
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedTeamResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Team], { nullable: true })
  teams(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListTeamInput, nullable: true }) input?: ListTeamInput,
  ) {
    return this.generatedService.teams(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  teamsCount(
    @Args({ name: 'input', type: () => ListTeamInput, nullable: true }) input?: ListTeamInput,
  ) {
    return this.generatedService.teamsCount(input)
  }

  @Query(() => Team, { nullable: true })
  team(@Info() info: GraphQLResolveInfo, @Args('teamId') teamId: string) {
    return this.generatedService.team(info, teamId)
  }

  @Mutation(() => Team, { nullable: true })
  createTeam(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateTeamInput) {
    return this.generatedService.createTeam(info, input)
  }

  @Mutation(() => Team, { nullable: true })
  updateTeam(
    @Info() info: GraphQLResolveInfo,
    @Args('teamId') teamId: string,
    @Args('input') input: UpdateTeamInput,
  ) {
    return this.generatedService.updateTeam(info, teamId, input)
  }

  @Mutation(() => Team, { nullable: true })
  deleteTeam(@Args('teamId') teamId: string) {
    return this.generatedService.deleteTeam(teamId)
  }
}
