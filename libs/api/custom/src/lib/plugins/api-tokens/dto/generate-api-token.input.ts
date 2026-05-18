import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty, IsOptional, IsDate, IsString } from 'class-validator'

@InputType()
export class GenerateApiTokenInput {
  @Field()
  @IsNotEmpty()
  name!: string

  @Field({ nullable: true })
  @IsOptional()
  @IsDate()
  expiresAt?: Date

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  organizationId?: string
}
