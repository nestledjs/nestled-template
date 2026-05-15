import { Module } from '@nestjs/common'
import { ApiCoreDataAccessModule } from '@nestled-template/api/core/data-access'
import { AuthCacheService } from '@nestled-template/api/utils'
import { TenancyMiddleware } from './tenancy.middleware'

@Module({
  imports: [ApiCoreDataAccessModule],
  providers: [TenancyMiddleware, AuthCacheService],
  exports: [TenancyMiddleware, AuthCacheService],
})
export class TenancyModule {}
