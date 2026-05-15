import { ApiCrudDataAccessService } from '@nestled-template/api/generated-crud/data-access'
import { GeneratedLinkResolver } from '@nestled-template/api/generated-crud/feature'
import { Injectable } from '@nestjs/common'
import { Resolver } from '@nestjs/graphql'
import { Link } from '@nestled-template/api/core/models'

@Resolver(() => Link)
@Injectable()
export class LinkResolver extends GeneratedLinkResolver {
  constructor(
    // private readonly customService: LinkService,
    generatedService: ApiCrudDataAccessService,
  ) {
    super(generatedService)
  }
}
