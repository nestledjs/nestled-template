import { Field, ObjectType } from '@nestjs/graphql'
import { ApiToken } from '@nestled-template/api/core/models'

@ObjectType()
export class GenerateApiTokenOutput {
  @Field()
  token!: string

  @Field(() => ApiToken)
  apiToken!: ApiToken
}
