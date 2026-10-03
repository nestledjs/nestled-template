import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class RemoveOrganizationMemberInput {
  @Field()
  organizationId!: string

  @Field()
  userId!: string
}
