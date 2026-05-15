import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedInviteResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Invite } from '@nestled-template/api/core/models'

@Resolver(() => Invite)
@Injectable()
export class InviteResolver extends GeneratedInviteResolver {
  constructor(
    // private readonly customService: InviteService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
