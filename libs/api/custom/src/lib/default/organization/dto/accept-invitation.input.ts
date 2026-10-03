import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class AcceptInvitationInput {
  @Field()
  token!: string
}
