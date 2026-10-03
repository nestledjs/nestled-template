import { Field, InputType } from '@nestjs/graphql'
import { EmailType } from '@nestled-template/api/core/models'

@InputType()
export class StaffUpdateEmailInput {
  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  public?: boolean

  @Field({ nullable: true })
  primary?: boolean

  @Field({ nullable: true })
  verified?: boolean

  @Field(() => EmailType, { nullable: true })
  emailType?: EmailType
}
