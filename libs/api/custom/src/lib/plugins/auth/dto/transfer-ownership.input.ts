import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class TransferOwnershipInput {
  @Field()
  organizationId!: string

  @Field()
  newOwnerUserId!: string
}
