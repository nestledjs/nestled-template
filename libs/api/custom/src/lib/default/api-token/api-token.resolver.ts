import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedApiTokenResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { ApiToken } from '@nestled-template/api/core/models'

@Resolver(() => ApiToken)
@Injectable()
export class ApiTokenResolver extends GeneratedApiTokenResolver {
  constructor(
    // private readonly customService: ApiTokenService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
