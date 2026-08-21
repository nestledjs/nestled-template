import { Field, InputType, Int, ObjectType } from '@nestjs/graphql'
import { Subscription } from '@nestled-template/api/core/models'

@InputType()
export class AdminBillingSubscriptionsInput {
  @Field(() => Int, { nullable: true })
  skip?: number

  @Field(() => Int, { nullable: true })
  take?: number

  @Field({ nullable: true })
  search?: string
}

@ObjectType()
export class AdminBillingSubscriptionsResponse {
  @Field(() => [Subscription])
  subscriptions!: Subscription[]

  @Field(() => Int)
  total!: number
}
