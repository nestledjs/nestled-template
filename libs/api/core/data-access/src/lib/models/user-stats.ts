import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class UserReferralStats {
  @Field()
  id: string

  @Field()
  firstName: string

  @Field()
  lastName: string

  @Field({ nullable: true })
  chapterName?: string

  @Field()
  referralCount: number

  @Field({ nullable: true })
  chapterMemberCount?: number
}

@ObjectType()
export class UserPowerHourStats {
  @Field()
  id: string

  @Field()
  firstName: string

  @Field()
  lastName: string

  @Field({ nullable: true })
  chapterName?: string

  @Field()
  powerHourCount: number

  @Field({ nullable: true })
  chapterMemberCount?: number
}
