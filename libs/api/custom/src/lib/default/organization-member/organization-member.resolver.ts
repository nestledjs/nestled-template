import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedOrganizationMemberResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { OrganizationMember } from '@nestled-template/api/core/models'

@Resolver(() => OrganizationMember)
@Injectable()
export class OrganizationMemberResolver extends GeneratedOrganizationMemberResolver {
  constructor(
    // private readonly customService: OrganizationMemberService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
