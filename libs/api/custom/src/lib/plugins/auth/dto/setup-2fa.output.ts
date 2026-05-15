import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class Setup2FAOutput {
  @Field()
  secret!: string

  @Field()
  qrCode!: string

  @Field()
  otpauthUrl!: string
}