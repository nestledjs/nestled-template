import { InputType, Field } from '@nestjs/graphql'

@InputType()
export class SecureUpdateUserPreferenceInput {
  @Field(() => String, { nullable: true })
  key?: string

  @Field(() => String, { nullable: true })
  value?: string
}
