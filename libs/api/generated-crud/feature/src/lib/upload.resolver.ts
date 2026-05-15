import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { Upload } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateUploadInput,
  ListUploadInput,
  UpdateUploadInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => Upload)
export class GeneratedUploadResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [Upload], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  uploads(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListUploadInput, nullable: true }) input?: ListUploadInput,
  ) {
    return this.generatedService.uploads(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  uploadsCount(
    @Args({ name: 'input', type: () => ListUploadInput, nullable: true }) input?: ListUploadInput,
  ) {
    return this.generatedService.uploadsCount(input)
  }

  @Query(() => Upload, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  upload(@Info() info: GraphQLResolveInfo, @Args('uploadId') uploadId: string) {
    return this.generatedService.upload(info, uploadId)
  }

  @Mutation(() => Upload, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createUpload(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateUploadInput) {
    return this.generatedService.createUpload(info, input)
  }

  @Mutation(() => Upload, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateUpload(
    @Info() info: GraphQLResolveInfo,
    @Args('uploadId') uploadId: string,
    @Args('input') input: UpdateUploadInput,
  ) {
    return this.generatedService.updateUpload(info, uploadId, input)
  }

  @Mutation(() => Upload, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteUpload(@Args('uploadId') uploadId: string) {
    return this.generatedService.deleteUpload(uploadId)
  }
}
