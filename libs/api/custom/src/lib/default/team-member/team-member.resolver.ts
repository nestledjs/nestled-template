import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedTeamMemberResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { TeamMember } from '@nestled-template/api/core/models'

@Resolver(() => TeamMember)
@Injectable()
export class TeamMemberResolver extends GeneratedTeamMemberResolver {
  constructor(
    // private readonly customService: TeamMemberService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
