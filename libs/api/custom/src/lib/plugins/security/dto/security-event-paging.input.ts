import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'

export enum SecurityEventOrderDirection {
  ASC = 'asc',
  DESC = 'desc',
}

registerEnumType(SecurityEventOrderDirection, {
  name: 'SecurityEventOrderDirection',
})

@InputType()
export class SecurityEventPagingInput {
  @Field(() => Int, { nullable: true, defaultValue: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number

  @Field(() => SecurityEventOrderDirection, {
    nullable: true,
    defaultValue: SecurityEventOrderDirection.DESC,
  })
  @IsOptional()
  @IsEnum(SecurityEventOrderDirection)
  orderDirection?: SecurityEventOrderDirection
}
