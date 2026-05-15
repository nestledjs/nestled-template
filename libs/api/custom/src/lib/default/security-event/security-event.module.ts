import { Module } from '@nestjs/common'
import { SecurityEventService } from './security-event.service'
import { SecurityEventResolver } from './security-event.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [SecurityEventService, SecurityEventResolver],
  exports: [SecurityEventService, SecurityEventResolver],
})
export class SecurityEventModule {}
