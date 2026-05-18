import { Field, InputType } from '@nestjs/graphql'
import { IsEmail, IsNotEmpty } from 'class-validator'

@InputType()
export class ChangeEmailInput {
  @Field()
  @IsNotEmpty()
  @IsEmail()
  newEmail!: string
}
