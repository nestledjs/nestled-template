import { Field, InputType } from '@nestjs/graphql'
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator'

@InputType()
export class UserCreateInput {
  @Field({ nullable: true })
  developer?: boolean

  @Field()
  @IsNotEmpty()
  @IsEmail()
  email!: string

  @Field({ nullable: true })
  username?: string

  @Field({ nullable: true })
  @IsNotEmpty()
  @MinLength(8)
  password!: string

  @Field({ nullable: true })
  firstName?: string

  @Field({ nullable: true })
  lastName?: string

  @Field({ nullable: true })
  avatarUrl?: string

  @Field({ nullable: true })
  phone?: string
}
