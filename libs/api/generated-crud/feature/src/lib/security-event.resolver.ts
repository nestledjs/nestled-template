import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { SecurityEvent } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateSecurityEventInput,
  ListSecurityEventInput,
  UpdateSecurityEventInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => SecurityEvent)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedSecurityEventResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [SecurityEvent], { nullable: true })
  securityEvents(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListSecurityEventInput, nullable: true })
    input?: ListSecurityEventInput,
  ) {
    return this.generatedService.securityEvents(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  securityEventsCount(
    @Args({ name: 'input', type: () => ListSecurityEventInput, nullable: true })
    input?: ListSecurityEventInput,
  ) {
    return this.generatedService.securityEventsCount(input)
  }

  @Query(() => SecurityEvent, { nullable: true })
  securityEvent(
    @Info() info: GraphQLResolveInfo,
    @Args('securityEventId') securityEventId: string,
  ) {
    return this.generatedService.securityEvent(info, securityEventId)
  }

  @Mutation(() => SecurityEvent, { nullable: true })
  createSecurityEvent(
    @Info() info: GraphQLResolveInfo,
    @Args('input') input: CreateSecurityEventInput,
  ) {
    return this.generatedService.createSecurityEvent(info, input)
  }

  @Mutation(() => SecurityEvent, { nullable: true })
  updateSecurityEvent(
    @Info() info: GraphQLResolveInfo,
    @Args('securityEventId') securityEventId: string,
    @Args('input') input: UpdateSecurityEventInput,
  ) {
    return this.generatedService.updateSecurityEvent(info, securityEventId, input)
  }

  @Mutation(() => SecurityEvent, { nullable: true })
  deleteSecurityEvent(@Args('securityEventId') securityEventId: string) {
    return this.generatedService.deleteSecurityEvent(securityEventId)
  }
}
