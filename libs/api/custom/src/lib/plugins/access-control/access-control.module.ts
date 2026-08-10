import { Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { ACCESS_CONTROL_SERVICE } from '@nestled-template/api/utils'
import { PlatformAccessControlResolver } from './access-control.resolver'
import { PlatformAccessControlService } from './access-control.service'

@Module({
  imports: [ApiCoreDataAccessModule],
  providers: [
    PlatformAccessControlResolver,
    PlatformAccessControlService,
    { provide: ACCESS_CONTROL_SERVICE, useExisting: PlatformAccessControlService },
  ],
  exports: [PlatformAccessControlService, ACCESS_CONTROL_SERVICE],
})
export class PlatformAccessControlModule {}
