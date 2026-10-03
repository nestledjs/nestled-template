import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty, Length } from 'class-validator'

@InputType()
export class Verify2FAInput {
  @Field()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string
}
