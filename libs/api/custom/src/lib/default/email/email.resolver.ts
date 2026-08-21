import { Injectable, UseGuards } from '@nestjs/common'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { Email } from '@nestled-template/api/core/models'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'
import { StaffUpdateEmailInput } from './dto'
import { StaffEmailService } from './email.service'

/**
 * Superadmin-only by class-level gate, and deliberately so — email.resolver.spec.ts asserts that
 * metadata. These mutations edit ANY user's email address.
 *
 * They therefore carry no per-operation permission and are recorded in permission-exemptions.json.
 * Moving them onto `platform.users.manage` alone would widen them from "superadmin" to "any role
 * holding that permission"; that may well be the right call, but it is a posture decision to take
 * deliberately, not a side effect of satisfying a coverage check.
 */
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
