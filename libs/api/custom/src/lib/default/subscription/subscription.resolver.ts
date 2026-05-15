import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedSubscriptionResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Subscription } from '@nestled-template/api/core/models'

@Resolver(() => Subscription)
@Injectable()
export class SubscriptionResolver extends GeneratedSubscriptionResolver {
  constructor(
    // private readonly customService: SubscriptionService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
