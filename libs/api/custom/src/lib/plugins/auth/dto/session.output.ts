import { Field, ObjectType, GraphQLISODateTime } from '@nestjs/graphql'

@ObjectType()
export class UserSessionOutput {
  @Field()
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  lastActiveAt!: Date

  @Field({ nullable: true })
  deviceInfo?: string

  @Field({ nullable: true })
  ipAddress?: string

  @Field()
  isValid!: boolean

  @Field()
  twoFactorVerified!: boolean

  @Field()
  isCurrent!: boolean // Will be set by resolver to indicate current session
}
