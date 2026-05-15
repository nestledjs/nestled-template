import { Field, ObjectType } from '@nestjs/graphql'
import { User } from '@nestled-template/api/core/models'

@ObjectType()
export class UserToken {
  @Field({ description: 'JWT Bearer token', nullable: true })
  token?: string

  @Field(() => User, { nullable: true })
  user?: User

  @Field({ description: 'Indicates if 2FA verification is required', nullable: true })
  requires2FA?: boolean

  @Field({ description: 'Temporary token for 2FA verification', nullable: true })
  tempToken?: string
}
