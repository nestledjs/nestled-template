import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty } from 'class-validator'

@InputType()
export class EmulateUserInput {
  @Field()
  @IsNotEmpty()
  userId!: string
}
