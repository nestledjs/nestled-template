import { Injectable, UseGuards } from '@nestjs/common'
import { Args, Info, Mutation, Resolver } from '@nestjs/graphql'
import {
  ApiCrudDataAccessService,
  UpdateEmailInput,
} from '@nestled-template/api/generated-crud/data-access'
import { Email } from '@nestled-template/api/core/models'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'
import type { GraphQLResolveInfo } from 'graphql'
import { AdminEmailService } from './admin-email.service'

@Resolver(() => Email)
@Injectable()
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class AdminEmailResolver {
  constructor(
    private readonly customService: AdminEmailService,
    private readonly generatedService: ApiCrudDataAccessService,
  ) {}

  @Mutation(() => Email, { nullable: true })
  async staffUpdateEmail(
    @Info() info: GraphQLResolveInfo,
    @Args('emailId') emailId: string,
    @Args('input') input: UpdateEmailInput,
  ) {
    await this.customService.validateEmailUpdate(emailId, input)

    return this.generatedService.updateEmail(info, emailId, input)
  }

  @Mutation(() => Email, { nullable: true })
  async staffDeleteEmail(@Args('emailId') emailId: string) {
    await this.customService.validateEmailDeletion(emailId)

    return this.generatedService.deleteEmail(emailId)
  }
}
