import { Module } from '@nestjs/common'
import { PasswordHistoryService } from './password-history.service'
import { PasswordHistoryResolver } from './password-history.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [PasswordHistoryService, PasswordHistoryResolver],
  exports: [PasswordHistoryService, PasswordHistoryResolver],
})
export class PasswordHistoryModule {}
