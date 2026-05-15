import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class ResendInvitationInput {
  @Field()
  invitationId!: string
}
