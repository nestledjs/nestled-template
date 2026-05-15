import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class RejectInvitationInput {
  @Field()
  token!: string
}