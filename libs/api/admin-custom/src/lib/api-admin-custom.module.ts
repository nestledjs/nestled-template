import { Module } from '@nestjs/common'
import { AdminEmailModule } from './email'

@Module({
  imports: [AdminEmailModule],
  exports: [AdminEmailModule],
})
export class ApiAdminCustomModule {}
