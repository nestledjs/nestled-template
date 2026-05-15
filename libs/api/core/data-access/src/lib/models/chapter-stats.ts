import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class ChapterBizStats {
  @Field()
  chapterId: string

  @Field()
  chapterName: string

  @Field()
  memberCount: number

  @Field()
  totalBiz: number
}

@ObjectType()
export class ChapterReferralStats {
  @Field()
  chapterId: string

  @Field()
  chapterName: string

  @Field()
  memberCount: number

  @Field()
  totalReferrals: number
}

@ObjectType()
export class ChapterPowerHourStats {
  @Field()
  chapterId: string

  @Field()
  chapterName: string

  @Field()
  memberCount: number

  @Field()
  totalPowerHours: number

  @Field()
  avgPowerHoursPerMember: number
}