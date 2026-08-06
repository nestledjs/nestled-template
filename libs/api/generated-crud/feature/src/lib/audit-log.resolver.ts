import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { AuditLog } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateAuditLogInput,
  ListAuditLogInput,
  UpdateAuditLogInput,
} from '@nestled-template/api/generated-crud/data-access'
import { AdminOnly, GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => AuditLog)
export class GeneratedAuditLogResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [AuditLog], { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  auditLogs(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListAuditLogInput, nullable: true })
    input?: ListAuditLogInput,
  ) {
    return this.generatedService.auditLogs(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  auditLogsCount(
    @Args({ name: 'input', type: () => ListAuditLogInput, nullable: true })
    input?: ListAuditLogInput,
  ) {
    return this.generatedService.auditLogsCount(input)
  }

  @Query(() => AuditLog, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  auditLog(@Info() info: GraphQLResolveInfo, @Args('auditLogId') auditLogId: string) {
    return this.generatedService.auditLog(info, auditLogId)
  }

  @Mutation(() => AuditLog, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  createAuditLog(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateAuditLogInput) {
    return this.generatedService.createAuditLog(info, input)
  }

  @Mutation(() => AuditLog, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  updateAuditLog(
    @Info() info: GraphQLResolveInfo,
    @Args('auditLogId') auditLogId: string,
    @Args('input') input: UpdateAuditLogInput,
  ) {
    return this.generatedService.updateAuditLog(info, auditLogId, input)
  }

  @Mutation(() => AuditLog, { nullable: true })
  @AdminOnly()
  @UseGuards(GqlAuthAdminGuard)
  deleteAuditLog(@Args('auditLogId') auditLogId: string) {
    return this.generatedService.deleteAuditLog(auditLogId)
  }
}
