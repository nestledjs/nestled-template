import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty } from 'class-validator'

@InputType()
export class ForgotPasswordInput {
  @Field()
  @IsNotEmpty()
  email!: string
}
