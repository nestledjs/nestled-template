import { Module } from '@nestjs/common'
import { OAuthAccountService } from './o-auth-account.service'
import { OAuthAccountResolver } from './o-auth-account.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [OAuthAccountService, OAuthAccountResolver],
  exports: [OAuthAccountService, OAuthAccountResolver],
})
export class OAuthAccountModule {}
