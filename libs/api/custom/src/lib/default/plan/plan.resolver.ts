import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedPlanResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Plan } from '@nestled-template/api/core/models'

@Resolver(() => Plan)
@Injectable()
export class PlanResolver extends GeneratedPlanResolver {
  constructor(
    // private readonly customService: PlanService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
