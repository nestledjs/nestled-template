import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class CancelInvitationInput {
  @Field()
  invitationId!: string
}
