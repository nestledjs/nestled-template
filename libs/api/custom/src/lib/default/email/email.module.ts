import { Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { StaffEmailResolver } from './email.resolver'
import { StaffEmailService } from './email.service'

@Module({
  imports: [ApiCoreDataAccessModule],
  providers: [StaffEmailResolver, StaffEmailService],
  exports: [StaffEmailResolver, StaffEmailService],
})
export class EmailModule {}
