import { Args, Query, Resolver, ObjectType, Field, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { SecurityEventsService } from './security-events.service'
import { Authenticated, CtxUser, GqlAuthGuard } from '@nestled-template/api/utils'
import { SecurityEvent, SecurityEventType, User } from '@nestled-template/api/core/models'
import { SecurityEventPagingInput } from './dto'

@Resolver(() => SecurityEvent)
export class SecurityEventsResolver {
  constructor(private readonly securityEventsService: SecurityEventsService) {}

  @Query(() => [SecurityEvent])
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async userSecurityEvents(
    @CtxUser() user: User,
    @Args('limit', { type: () => Number, nullable: true }) limit?: number,
  ): Promise<SecurityEvent[]> {
    return this.securityEventsService.getUserSecurityEvents(user.id, limit || 50)
  }

  @Query(() => [SecurityEvent])
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async mySecurityEvents(
    @CtxUser() user: User,
    @Args({ name: 'input', type: () => SecurityEventPagingInput, nullable: true })
    input?: SecurityEventPagingInput,
  ): Promise<SecurityEvent[]> {
    return this.securityEventsService.getUserSecurityEventsWithPaging(user.id, input)
  }

  @Query(() => [SecurityEvent])
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async securityEventsByType(
    @CtxUser() user: User,
    @Args('eventType', { type: () => SecurityEventType }) eventType: SecurityEventType,
    @Args('limit', { type: () => Number, nullable: true }) limit?: number,
  ): Promise<SecurityEvent[]> {
    return this.securityEventsService.getEventsByType(user.id, eventType, limit || 50)
  }

  @Query(() => SecuritySummary)
  @UseGuards(GqlAuthGuard)
  @Authenticated()
  async securitySummary(@CtxUser() user: User): Promise<any> {
    return this.securityEventsService.getSecuritySummary(user.id)
  }
}

// Define SecuritySummary type for GraphQL
@ObjectType()
export class SecuritySummary {
  @Field(() => Int)
  recentEventsCount!: number

  @Field(() => Date, { nullable: true })
  lastPasswordChange?: Date | null

  @Field(() => Int)
  suspiciousAttemptsLast30Days!: number
}
