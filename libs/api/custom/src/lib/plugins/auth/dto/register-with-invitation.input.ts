import { IsEmail, IsNotEmpty, MinLength } from 'class-validator'
import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class RegisterWithInvitationInput {
  @Field()
  @IsNotEmpty()
  invitationToken!: string

  @Field()
  @IsNotEmpty()
  @IsEmail()
  email!: string

  @Field()
  @IsNotEmpty()
  firstName!: string

  @Field()
  @IsNotEmpty()
  lastName!: string

  @Field()
  @IsNotEmpty()
  @MinLength(8)
  password!: string

  @Field({ nullable: true })
  phone?: string

  @Field({ nullable: true })
  avatarUrl?: string
}
