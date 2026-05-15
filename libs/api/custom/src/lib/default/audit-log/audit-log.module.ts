import { Module } from '@nestjs/common'
import { AuditLogService } from './audit-log.service'
import { AuditLogResolver } from './audit-log.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [AuditLogService, AuditLogResolver],
  exports: [AuditLogService, AuditLogResolver],
})
export class AuditLogModule {}
