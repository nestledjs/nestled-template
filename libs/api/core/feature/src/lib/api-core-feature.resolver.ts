import { Float, Query, Resolver } from '@nestjs/graphql'
import { ApiCoreFeatureService } from './api-core-feature.service'
import { Public } from '@nestled-template/api/utils'

@Resolver()
export class ApiCoreFeatureResolver {
  constructor(private readonly service: ApiCoreFeatureService) {}

  @Query(() => Float, { nullable: true })
  @Public()
  uptime() {
    return this.service.uptime()
  }
}
