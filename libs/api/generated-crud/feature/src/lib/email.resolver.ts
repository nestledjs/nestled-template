import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Email } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateEmailInput,
  ListEmailInput,
  UpdateEmailInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Email)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedEmailResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Email], { nullable: true })
  emails(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListEmailInput, nullable: true }) input?: ListEmailInput,
  ) {
    return this.generatedService.emails(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  emailsCount(
    @Args({ name: 'input', type: () => ListEmailInput, nullable: true }) input?: ListEmailInput,
  ) {
    return this.generatedService.emailsCount(input)
  }

  @Query(() => Email, { nullable: true })
  email(@Info() info: GraphQLResolveInfo, @Args('emailId') emailId: string) {
    return this.generatedService.email(info, emailId)
  }

  @Mutation(() => Email, { nullable: true })
  createEmail(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateEmailInput) {
    return this.generatedService.createEmail(info, input)
  }

  @Mutation(() => Email, { nullable: true })
  updateEmail(
    @Info() info: GraphQLResolveInfo,
    @Args('emailId') emailId: string,
    @Args('input') input: UpdateEmailInput,
  ) {
    return this.generatedService.updateEmail(info, emailId, input)
  }

  @Mutation(() => Email, { nullable: true })
  deleteEmail(@Args('emailId') emailId: string) {
    return this.generatedService.deleteEmail(emailId)
  }
}
