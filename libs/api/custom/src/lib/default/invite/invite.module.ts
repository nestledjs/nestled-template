import { Module } from '@nestjs/common'
import { InviteService } from './invite.service'
import { InviteResolver } from './invite.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [InviteService, InviteResolver],
  exports: [InviteService, InviteResolver],
})
export class InviteModule {}
