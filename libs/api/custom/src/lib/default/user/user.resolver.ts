import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedUserResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { User } from '@nestled-template/api/core/models'

@Resolver(() => User)
@Injectable()
export class UserResolver extends GeneratedUserResolver {
  constructor(
    // private readonly customService: UserService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
