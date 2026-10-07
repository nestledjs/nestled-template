import { Field, ObjectType } from '@nestjs/graphql'
import { User } from '@nestled-template/api/core/models'

@ObjectType()
export class AdminUserSession {
  @Field()
  id!: string

  @Field({ nullable: true })
  ipAddress?: string | null

  @Field({ nullable: true })
  deviceInfo?: string | null

  @Field()
  lastActiveAt!: Date

  @Field()
  isValid!: boolean
}

/** Session details belong to the permission-checked admin query, not the generic User type. */
@ObjectType()
export class AdminUserDetails extends User {
  @Field(() => [AdminUserSession])
  activeSessions!: AdminUserSession[]
}
