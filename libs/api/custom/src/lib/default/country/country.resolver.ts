import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedCountryResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Country } from '@nestled-template/api/core/models'

@Resolver(() => Country)
@Injectable()
export class CountryResolver extends GeneratedCountryResolver {
  constructor(
    // private readonly customService: CountryService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
