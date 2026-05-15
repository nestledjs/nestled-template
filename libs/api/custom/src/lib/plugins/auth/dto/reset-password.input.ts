import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty } from 'class-validator'

@InputType()
export class ResetPasswordInput {
  @Field()
  @IsNotEmpty()
  token!: string

  @Field()
  @IsNotEmpty()
  password!: string
}
