import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty } from 'class-validator'

@InputType()
export class Disable2FAInput {
  @Field()
  @IsNotEmpty()
  password!: string
}