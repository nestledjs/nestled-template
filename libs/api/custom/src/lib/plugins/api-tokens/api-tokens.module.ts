import { Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { SecurityEventsModule } from '../security/security-events.module'
import { ApiTokensService } from './api-tokens.service'
import { ApiTokensResolver } from './api-tokens.resolver'

@Module({
  imports: [ApiCoreDataAccessModule, SecurityEventsModule],
  providers: [ApiTokensService, ApiTokensResolver],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
