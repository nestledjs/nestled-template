import { Field, InputType } from '@nestjs/graphql'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

@InputType()
export class UserUpdateOrganizationInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string
}
