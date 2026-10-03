import { Module, Global } from '@nestjs/common'

import { ApiCoreDataAccessService } from './api-core-data-access.service'

@Global()
@Module({
  providers: [ApiCoreDataAccessService],
  exports: [ApiCoreDataAccessService],
})
export class ApiCoreDataAccessModule {}
