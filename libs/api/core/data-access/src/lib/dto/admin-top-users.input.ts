import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class AdminTopUsersInput {
  @Field(() => Date, { nullable: true })
  startDate?: Date

  @Field(() => Date, { nullable: true })
  endDate?: Date

  @Field({ nullable: true })
  minMembers?: number

  @Field({ nullable: true })
  maxMembers?: number

  @Field({ nullable: true, defaultValue: 5 })
  limit?: number
}
