import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Link } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateLinkInput,
  ListLinkInput,
  UpdateLinkInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Link)
export class GeneratedLinkResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Link], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  links(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListLinkInput, nullable: true }) input?: ListLinkInput,
  ) {
    return this.generatedService.links(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  linksCount(
    @Args({ name: 'input', type: () => ListLinkInput, nullable: true }) input?: ListLinkInput,
  ) {
    return this.generatedService.linksCount(input)
  }

  @Query(() => Link, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  link(@Info() info: GraphQLResolveInfo, @Args('linkId') linkId: string) {
    return this.generatedService.link(info, linkId)
  }

  @Mutation(() => Link, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createLink(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateLinkInput) {
    return this.generatedService.createLink(info, input)
  }

  @Mutation(() => Link, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateLink(
    @Info() info: GraphQLResolveInfo,
    @Args('linkId') linkId: string,
    @Args('input') input: UpdateLinkInput,
  ) {
    return this.generatedService.updateLink(info, linkId, input)
  }

  @Mutation(() => Link, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteLink(@Args('linkId') linkId: string) {
    return this.generatedService.deleteLink(linkId)
  }
}
