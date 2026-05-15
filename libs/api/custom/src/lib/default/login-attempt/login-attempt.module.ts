import { Module } from '@nestjs/common'
import { LoginAttemptService } from './login-attempt.service'
import { LoginAttemptResolver } from './login-attempt.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [LoginAttemptService, LoginAttemptResolver],
  exports: [LoginAttemptService, LoginAttemptResolver],
})
export class LoginAttemptModule {}
