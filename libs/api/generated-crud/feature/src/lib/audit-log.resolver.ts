import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { AuditLog } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateAuditLogInput,
  ListAuditLogInput,
  UpdateAuditLogInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => AuditLog)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedAuditLogResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [AuditLog], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  auditLogs(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListAuditLogInput, nullable: true })
    input?: ListAuditLogInput,
  ) {
    return this.generatedService.auditLogs(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  auditLogsCount(
    @Args({ name: 'input', type: () => ListAuditLogInput, nullable: true })
    input?: ListAuditLogInput,
  ) {
    return this.generatedService.auditLogsCount(input)
  }

  @Query(() => AuditLog, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  auditLog(@Info() info: GraphQLResolveInfo, @Args('auditLogId') auditLogId: string) {
    return this.generatedService.auditLog(info, auditLogId)
  }

  @Mutation(() => AuditLog, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createAuditLog(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateAuditLogInput) {
    return this.generatedService.createAuditLog(info, input)
  }

  @Mutation(() => AuditLog, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateAuditLog(
    @Info() info: GraphQLResolveInfo,
    @Args('auditLogId') auditLogId: string,
    @Args('input') input: UpdateAuditLogInput,
  ) {
    return this.generatedService.updateAuditLog(info, auditLogId, input)
  }

  @Mutation(() => AuditLog, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteAuditLog(@Args('auditLogId') auditLogId: string) {
    return this.generatedService.deleteAuditLog(auditLogId)
  }
}
