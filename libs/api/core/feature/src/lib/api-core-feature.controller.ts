import { Controller, Get } from '@nestjs/common'
import { ApiCoreFeatureService } from './api-core-feature.service'
import { Public } from '@nestled-template/api/utils'

// Liveness/readiness probe.
@Public()
@Controller()
export class ApiCoreFeatureController {
  constructor(private readonly service: ApiCoreFeatureService) {}

  @Get('uptime')
  uptime() {
    return this.service.uptime()
  }
}
