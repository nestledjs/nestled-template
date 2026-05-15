import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedRoleResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Role } from '@nestled-template/api/core/models'

@Resolver(() => Role)
@Injectable()
export class RoleResolver extends GeneratedRoleResolver {
  constructor(
    // private readonly customService: RoleService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
