import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Address } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateAddressInput,
  ListAddressInput,
  UpdateAddressInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Address)
export class GeneratedAddressResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Address], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  addresses(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListAddressInput, nullable: true }) input?: ListAddressInput,
  ) {
    return this.generatedService.addresses(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  addressesCount(
    @Args({ name: 'input', type: () => ListAddressInput, nullable: true }) input?: ListAddressInput,
  ) {
    return this.generatedService.addressesCount(input)
  }

  @Query(() => Address, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  address(@Info() info: GraphQLResolveInfo, @Args('addressId') addressId: string) {
    return this.generatedService.address(info, addressId)
  }

  @Mutation(() => Address, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createAddress(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateAddressInput) {
    return this.generatedService.createAddress(info, input)
  }

  @Mutation(() => Address, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateAddress(
    @Info() info: GraphQLResolveInfo,
    @Args('addressId') addressId: string,
    @Args('input') input: UpdateAddressInput,
  ) {
    return this.generatedService.updateAddress(info, addressId, input)
  }

  @Mutation(() => Address, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteAddress(@Args('addressId') addressId: string) {
    return this.generatedService.deleteAddress(addressId)
  }
}
