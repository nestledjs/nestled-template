import { Module } from '@nestjs/common'
import { PermissionService } from './permission.service'
import { PermissionResolver } from './permission.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [PermissionService, PermissionResolver],
  exports: [PermissionService, PermissionResolver],
})
export class PermissionModule {}
