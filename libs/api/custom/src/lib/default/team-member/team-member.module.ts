import { Module } from '@nestjs/common'
import { TeamMemberService } from './team-member.service'
import { TeamMemberResolver } from './team-member.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [TeamMemberService, TeamMemberResolver],
  exports: [TeamMemberService, TeamMemberResolver],
})
export class TeamMemberModule {}
