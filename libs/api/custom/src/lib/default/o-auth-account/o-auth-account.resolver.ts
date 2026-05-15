import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedOAuthAccountResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { OAuthAccount } from '@nestled-template/api/core/models'

@Resolver(() => OAuthAccount)
@Injectable()
export class OAuthAccountResolver extends GeneratedOAuthAccountResolver {
  constructor(
    // private readonly customService: OAuthAccountService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
