import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class CorePaging {
  @Field({ nullable: true })
  total?: number

  @Field({ nullable: true })
  filteredTotal?: number

  @Field({ nullable: true })
  count?: number

  @Field({ nullable: true })
  take?: number

  @Field({ nullable: true })
  page?: number

  @Field({ nullable: true })
  skip?: number

  @Field({ nullable: true })
  pages?: number

  @Field({ nullable: true })
  hasNext?: boolean

  @Field({ nullable: true })
  hasPrev?: boolean
}
