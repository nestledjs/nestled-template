import { Module } from '@nestjs/common'
import { UserSessionService } from './user-session.service'
import { UserSessionResolver } from './user-session.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [UserSessionService, UserSessionResolver],
  exports: [UserSessionService, UserSessionResolver],
})
export class UserSessionModule {}
