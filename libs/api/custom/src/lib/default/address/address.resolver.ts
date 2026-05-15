import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedAddressResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Address } from '@nestled-template/api/core/models'

@Resolver(() => Address)
@Injectable()
export class AddressResolver extends GeneratedAddressResolver {
  constructor(
    // private readonly customService: AddressService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
