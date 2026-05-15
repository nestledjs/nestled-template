import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedPasswordHistoryResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { PasswordHistory } from '@nestled-template/api/core/models'

@Resolver(() => PasswordHistory)
@Injectable()
export class PasswordHistoryResolver extends GeneratedPasswordHistoryResolver {
  constructor(
    // private readonly customService: PasswordHistoryService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
