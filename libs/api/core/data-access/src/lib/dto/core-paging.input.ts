import { Field, InputType } from '@nestjs/graphql'

// `filters` used to live here as an untyped `GraphQLJSONObject` that reached Prisma's `where`
// clause verbatim, which let any caller build arbitrary filter expressions — including on columns
// carrying `@graphqlOmit`, since Prisma's `where` is built from the database model rather than the
// GraphQL model. That turned every reachable list query into a boolean oracle over the database.
//
// Each generated `List<Model>Input` now declares its own typed `<Model>FilterInput` instead, built
// from the same field list that `@graphqlOmit` already strips, so an omitted column is unfilterable
// by construction. The field is deliberately absent from this base class: a hand-written input that
// extends `CorePagingInput` must opt into filtering explicitly rather than inherit an open one.
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
}
