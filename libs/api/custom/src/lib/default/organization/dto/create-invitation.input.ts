import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class CreateInvitationInput {
  @Field()
  organizationId!: string

  @Field()
  email!: string

  @Field()
  roleId!: string
}