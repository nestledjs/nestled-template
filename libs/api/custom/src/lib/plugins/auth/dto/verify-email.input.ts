import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty } from 'class-validator'

@InputType()
export class VerifyEmailInput {
  @Field()
  @IsNotEmpty()
  token!: string
}


