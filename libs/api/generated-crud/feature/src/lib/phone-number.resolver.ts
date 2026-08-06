import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { PhoneNumber } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreatePhoneNumberInput,
  ListPhoneNumberInput,
  UpdatePhoneNumberInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => PhoneNumber)
export class GeneratedPhoneNumberResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [PhoneNumber], { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  phoneNumbers(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListPhoneNumberInput, nullable: true })
    input?: ListPhoneNumberInput,
  ) {
    return this.generatedService.phoneNumbers(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  phoneNumbersCount(
    @Args({ name: 'input', type: () => ListPhoneNumberInput, nullable: true })
    input?: ListPhoneNumberInput,
  ) {
    return this.generatedService.phoneNumbersCount(input)
  }

  @Query(() => PhoneNumber, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  phoneNumber(@Info() info: GraphQLResolveInfo, @Args('phoneNumberId') phoneNumberId: string) {
    return this.generatedService.phoneNumber(info, phoneNumberId)
  }

  @Mutation(() => PhoneNumber, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  createPhoneNumber(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreatePhoneNumberInput,
  ) {
    return this.generatedService.createPhoneNumber(info, input)
  }

  @Mutation(() => PhoneNumber, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  updatePhoneNumber(
    @Info() info: GraphQLResolveInfo,
    @Args('phoneNumberId') phoneNumberId: string,
    @Args('input') input: UpdatePhoneNumberInput,
  ) {
    return this.generatedService.updatePhoneNumber(info, phoneNumberId, input)
  }

  @Mutation(() => PhoneNumber, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  deletePhoneNumber(@Args('phoneNumberId') phoneNumberId: string) {
    return this.generatedService.deletePhoneNumber(phoneNumberId)
  }
}
