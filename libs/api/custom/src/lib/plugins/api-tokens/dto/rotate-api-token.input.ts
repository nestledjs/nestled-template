import { Field, InputType } from '@nestjs/graphql'
import { IsNotEmpty, IsBoolean, IsOptional } from 'class-validator'

@InputType()
export class RotateApiTokenInput {
  @Field()
  @IsNotEmpty()
  tokenId!: string

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  keepOldTokenActive?: boolean
}
