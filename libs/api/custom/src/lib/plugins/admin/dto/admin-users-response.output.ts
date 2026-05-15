import { Field, Int, ObjectType } from '@nestjs/graphql'
import { User } from '@nestled-template/api/core/models'

@ObjectType()
export class AdminUsersResponse {
  @Field(() => [User])
  users: User[]

  @Field(() => Int)
  total: number

  @Field(() => Int)
  skip: number

  @Field(() => Int)
  take: number
}
