import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedLoginAttemptResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { LoginAttempt } from '@nestled-template/api/core/models'

@Resolver(() => LoginAttempt)
@Injectable()
export class LoginAttemptResolver extends GeneratedLoginAttemptResolver {
  constructor(
    // private readonly customService: LoginAttemptService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
