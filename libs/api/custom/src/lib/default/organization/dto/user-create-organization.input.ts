import { Field, InputType } from '@nestjs/graphql'
import { IsString, MaxLength, MinLength } from 'class-validator'

@InputType()
export class UserCreateOrganizationInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string
}
