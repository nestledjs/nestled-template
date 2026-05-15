import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedAuditLogResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { AuditLog } from '@nestled-template/api/core/models'

@Resolver(() => AuditLog)
@Injectable()
export class AuditLogResolver extends GeneratedAuditLogResolver {
  constructor(
    // private readonly customService: AuditLogService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
