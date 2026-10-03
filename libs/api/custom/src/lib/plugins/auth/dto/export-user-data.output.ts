import { Field, ObjectType } from '@nestjs/graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

@ObjectType()
export class ExportUserDataOutput {
  @Field(() => GraphQLJSONObject)
  userData!: Record<string, any>

  @Field()
  exportedAt!: Date

  @Field()
  userId!: string
}
