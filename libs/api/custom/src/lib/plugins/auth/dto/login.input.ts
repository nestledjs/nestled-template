import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty, IsString, MinLength } from 'class-validator'

@InputType()
export class LoginInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  email!: string

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string

  @Field({ nullable: true })
  remember?: boolean
}
