import { Module } from '@nestjs/common'
import { StoredFileService } from './stored-file.service'
import { StoredFileResolver } from './stored-file.resolver'
import { ApiCrudDataAccessModule } from '@nestled-template/api/generated-crud/data-access'

@Module({
  imports: [ApiCrudDataAccessModule],
  providers: [StoredFileService, StoredFileResolver],
  exports: [StoredFileService, StoredFileResolver],
})
export class StoredFileModule {}
