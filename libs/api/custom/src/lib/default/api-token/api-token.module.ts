import { Module } from '@nestjs/common'
import { ApiTokenService } from './api-token.service'
import { ApiTokenResolver } from './api-token.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [ApiTokenService, ApiTokenResolver],
  exports: [ApiTokenService, ApiTokenResolver],
})
export class ApiTokenModule {}
