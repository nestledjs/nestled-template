import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedTeamResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Team } from '@nestled-template/api/core/models'

@Resolver(() => Team)
@Injectable()
export class TeamResolver extends GeneratedTeamResolver {
  constructor(
    // private readonly customService: TeamService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
