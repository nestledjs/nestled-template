import { Module } from '@nestjs/common'

import { ApiCrudDataAccessService } from './api-crud-data-access.service'

@Module({
  providers: [ApiCrudDataAccessService],
  exports: [ApiCrudDataAccessService],
})
export class ApiCrudDataAccessModule {}
