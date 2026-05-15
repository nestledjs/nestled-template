import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedStoredFileResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { StoredFile } from '@nestled-template/api/core/models'

@Resolver(() => StoredFile)
@Injectable()
export class StoredFileResolver extends GeneratedStoredFileResolver {
  constructor(
    // private readonly customService: StoredFileService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
