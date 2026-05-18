import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class Enable2FAOutput {
  @Field()
  success!: boolean

  @Field(() => [String])
  backupCodes!: string[]
}
