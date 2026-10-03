import { Field, InputType } from '@nestjs/graphql'
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator'

@InputType()
export class UpdateMyProfileInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9.]{3,50}$/, {
    message: 'displayName must contain 3-50 lowercase letters, numbers, or periods',
  })
  displayName?: string
}
