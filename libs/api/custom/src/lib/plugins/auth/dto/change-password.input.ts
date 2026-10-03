import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty, MinLength } from 'class-validator'

@InputType()
export class ChangePasswordInput {
  @Field()
  @IsNotEmpty()
  currentPassword!: string

  @Field()
  @IsNotEmpty()
  @MinLength(8)
  newPassword!: string
}
