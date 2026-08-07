import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Country } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateCountryInput,
  ListCountryInput,
  UpdateCountryInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Country)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedCountryResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Country], { nullable: true })
  countries(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListCountryInput, nullable: true }) input?: ListCountryInput,
  ) {
    return this.generatedService.countries(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  countriesCount(
    @Args({ name: 'input', type: () => ListCountryInput, nullable: true }) input?: ListCountryInput,
  ) {
    return this.generatedService.countriesCount(input)
  }

  @Query(() => Country, { nullable: true })
  country(@Info() info: GraphQLResolveInfo, @Args('countryId') countryId: string) {
    return this.generatedService.country(info, countryId)
  }

  @Mutation(() => Country, { nullable: true })
  createCountry(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateCountryInput) {
    return this.generatedService.createCountry(info, input)
  }

  @Mutation(() => Country, { nullable: true })
  updateCountry(
    @Info() info: GraphQLResolveInfo,
    @Args('countryId') countryId: string,
    @Args('input') input: UpdateCountryInput,
  ) {
    return this.generatedService.updateCountry(info, countryId, input)
  }

  @Mutation(() => Country, { nullable: true })
  deleteCountry(@Args('countryId') countryId: string) {
    return this.generatedService.deleteCountry(countryId)
  }
}
