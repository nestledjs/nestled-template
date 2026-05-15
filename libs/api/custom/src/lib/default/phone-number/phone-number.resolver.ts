import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedPhoneNumberResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { PhoneNumber } from '@nestled-template/api/core/models'

@Resolver(() => PhoneNumber)
@Injectable()
export class PhoneNumberResolver extends GeneratedPhoneNumberResolver {
  constructor(
    // private readonly customService: PhoneNumberService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
