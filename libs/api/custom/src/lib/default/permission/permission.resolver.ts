import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedPermissionResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Permission } from '@nestled-template/api/core/models'

@Resolver(() => Permission)
@Injectable()
export class PermissionResolver extends GeneratedPermissionResolver {
  constructor(
    // private readonly customService: PermissionService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
