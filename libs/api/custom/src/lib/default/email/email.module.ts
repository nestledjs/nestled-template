import { Module } from '@nestjs/common'
import { EmailService } from './email.service'
import { EmailResolver } from './email.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'

@Module({
  imports: [ApiCrudDataAccessModule, ApiCoreDataAccessModule],
  providers: [EmailService, EmailResolver],
  exports: [EmailService, EmailResolver],
})
export class EmailModule {}
