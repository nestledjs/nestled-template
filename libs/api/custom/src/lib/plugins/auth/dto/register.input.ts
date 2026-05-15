import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator'
import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class RegisterInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @IsEmail()
  email!: string

  @Field({ nullable: true })
  username?: string

  @Field({ nullable: true })
  firstName?: string

  @Field({ nullable: true })
  lastName?: string

  @Field({ nullable: true })
  phone?: string

  @Field({ nullable: true })
  avatarUrl?: string

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string

  @Field({ nullable: true })
  organizationName?: string
}
