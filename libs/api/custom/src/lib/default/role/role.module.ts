import { Module } from '@nestjs/common'
import { RoleService } from './role.service'
import { RoleResolver } from './role.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [RoleService, RoleResolver],
  exports: [RoleService, RoleResolver],
})
export class RoleModule {}
