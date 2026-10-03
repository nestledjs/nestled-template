import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class UpdateMemberRoleInput {
  @Field()
  organizationId!: string

  @Field()
  userId!: string

  @Field()
  roleId!: string
}
