import { Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'
import { AdminEmailResolver } from './admin-email.resolver'
import { AdminEmailService } from './admin-email.service'

@Module({
  imports: [ApiCoreDataAccessModule, ApiCrudDataAccessModule],
  providers: [AdminEmailResolver, AdminEmailService],
  exports: [AdminEmailResolver, AdminEmailService],
})
export class AdminEmailModule {}
