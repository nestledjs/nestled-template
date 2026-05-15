import { Module } from '@nestjs/common'
import { PlanService } from './plan.service'
import { PlanResolver } from './plan.resolver'
import { UserPlanResolver } from './user-plan.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [PlanService, PlanResolver, UserPlanResolver],
  exports: [PlanService, PlanResolver, UserPlanResolver],
})
export class PlanModule {}
