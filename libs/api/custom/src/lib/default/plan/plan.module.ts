import { Module } from '@nestjs/common'
import { UserPlanResolver } from './user-plan.resolver'

@Module({
  providers: [UserPlanResolver],
  exports: [UserPlanResolver],
})
export class PlanModule {}
