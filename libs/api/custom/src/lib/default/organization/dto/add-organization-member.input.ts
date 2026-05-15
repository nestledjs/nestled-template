import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class AddOrganizationMemberInput {
  @Field()
  organizationId!: string

  @Field()
  userId!: string

  @Field()
  roleId!: string
}