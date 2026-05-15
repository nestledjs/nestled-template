import { Field, InputType } from '@nestjs/graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

@InputType()
export class CorePagingInput {
  @Field({ nullable: true, defaultValue: 20 })
  take?: number

  @Field({ nullable: true, defaultValue: 0 })
  skip?: number

  @Field({ nullable: true })
  search?: string

  @Field(() => [String], { nullable: true })
  searchFields?: string[]

  @Field({ nullable: true })
  orderDirection?: 'asc' | 'desc'

  @Field({ nullable: true })
  orderBy?: string

  @Field(() => GraphQLJSONObject, { nullable: true })
  filters?: Record<string, unknown>
}
