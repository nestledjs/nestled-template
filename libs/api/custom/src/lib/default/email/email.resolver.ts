import {
  ApiCrudDataAccessService,
  UpdateEmailInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GeneratedEmailResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable, UseGuards } from '@nestjs/common'
import { Args, Info, Mutation, Resolver } from '@nestjs/graphql'
import { Email } from '@nestled-template/api/core/models'
import { EmailService } from './email.service'
import { GraphQLResolveInfo } from 'graphql'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Email)
@Injectable()
export class EmailResolver extends GeneratedEmailResolver {
  constructor(
    private readonly customService: EmailService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }

  @Mutation(() => Email, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  @AdminOnly()
  async staffUpdateEmail(
    @Info() info: GraphQLResolveInfo,
    @Args('emailId') emailId: string,
    @Args('input') input: UpdateEmailInput,
  ) {
    // Validate that unverified emails can't be set as primary
    await this.customService.validateEmailUpdate(emailId, input)

    // Call the parent implementation to do the actual update
    return super.updateEmail(info, emailId, input)
  }

  @Mutation(() => Email, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  @AdminOnly()
  async staffDeleteEmail(@Args('emailId') emailId: string) {
    // Validate that we're not deleting the only email or primary without a replacement
    await this.customService.validateEmailDeletion(emailId)

    // Call the parent implementation to do the actual delete
    return super.deleteEmail(emailId)
  }
}
