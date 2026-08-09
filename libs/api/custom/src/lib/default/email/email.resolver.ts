import { Injectable, UseGuards } from '@nestjs/common'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { Email } from '@nestled-template/api/core/models'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'
import { StaffUpdateEmailInput } from './dto'
import { StaffEmailService } from './email.service'

@Resolver(() => Email)
@Injectable()
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class StaffEmailResolver {
  constructor(private readonly service: StaffEmailService) {}

  @Mutation(() => Email, { nullable: true })
  staffUpdateEmail(
    @Args('emailId') emailId: string,
    @Args('input') input: StaffUpdateEmailInput,
  ): Promise<Email> {
    return this.service.staffUpdateEmail(emailId, input)
  }

  @Mutation(() => Email, { nullable: true })
  staffDeleteEmail(@Args('emailId') emailId: string): Promise<Email> {
    return this.service.staffDeleteEmail(emailId)
  }
}
