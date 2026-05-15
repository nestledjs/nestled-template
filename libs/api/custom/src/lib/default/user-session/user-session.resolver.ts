import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedUserSessionResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { UserSession } from '@nestled-template/api/core/models'

@Resolver(() => UserSession)
@Injectable()
export class UserSessionResolver extends GeneratedUserSessionResolver {
  constructor(
    // private readonly customService: UserSessionService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
