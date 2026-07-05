import { Field, ObjectType } from '@nestjs/graphql'
import { GraphQLJSON } from 'graphql-type-json'

@ObjectType()
export class ExportUserDataOutput {
  @Field(() => GraphQLJSON)
  userData!: Record<string, any>

  @Field()
  exportedAt!: Date

  @Field()
  userId!: string
}
