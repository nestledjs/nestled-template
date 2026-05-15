import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class MultiSelectInput {
  @Field({ nullable: true })
  id?: string
}
