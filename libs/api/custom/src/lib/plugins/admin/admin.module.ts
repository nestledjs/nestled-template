import { Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { AdminResolver } from './admin.resolver'
import { AdminService } from './admin.service'
import { PlatformAccessControlModule } from '../access-control'

@Module({
  imports: [ApiCoreDataAccessModule, PlatformAccessControlModule],
  providers: [AdminResolver, AdminService],
  exports: [AdminService],
})
export class AdminModule {}
