import { Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { SecurityEventsService } from './security-events.service'
import { SecurityEventsResolver } from './security-events.resolver'

@Module({
  imports: [ApiCoreDataAccessModule],
  providers: [SecurityEventsService, SecurityEventsResolver],
  exports: [SecurityEventsService],
})
export class SecurityEventsModule {}