import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedSecurityEventResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { SecurityEvent } from '@nestled-template/api/core/models'

@Resolver(() => SecurityEvent)
@Injectable()
export class SecurityEventResolver extends GeneratedSecurityEventResolver {
  constructor(
    // private readonly customService: SecurityEventService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
