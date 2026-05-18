import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class TransferOrganizationOwnershipInput {
  @Field()
  organizationId!: string

  @Field()
  newOwnerUserId!: string
}
