import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class SwitchOrganizationInput {
  @Field()
  organizationId!: string
}
