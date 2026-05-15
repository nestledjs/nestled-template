import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class InvitationDetails {
  @Field()
  id!: string

  @Field()
  email!: string

  @Field()
  organizationName!: string

  @Field()
  roleName!: string

  @Field()
  inviterName!: string

  @Field()
  expiresAt!: Date
}
