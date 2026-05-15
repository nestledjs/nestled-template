import { Module } from '@nestjs/common'
import { TeamService } from './team.service'
import { TeamResolver } from './team.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [TeamService, TeamResolver],
  exports: [TeamService, TeamResolver],
})
export class TeamModule {}
