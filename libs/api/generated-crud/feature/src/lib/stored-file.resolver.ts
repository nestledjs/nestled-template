import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { StoredFile } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateStoredFileInput,
  ListStoredFileInput,
  UpdateStoredFileInput,
} from '@nestled-template/api/generated-crud/data-access'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'

@Resolver(() => StoredFile)
export class GeneratedStoredFileResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [StoredFile], { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  storedFiles(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListStoredFileInput, nullable: true })
    input?: ListStoredFileInput,
  ) {
    return this.generatedService.storedFiles(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  storedFilesCount(
    @Args({ name: 'input', type: () => ListStoredFileInput, nullable: true })
    input?: ListStoredFileInput,
  ) {
    return this.generatedService.storedFilesCount(input)
  }

  @Query(() => StoredFile, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  storedFile(@Info() info: GraphQLResolveInfo, @Args('storedFileId') storedFileId: string) {
    return this.generatedService.storedFile(info, storedFileId)
  }

  @Mutation(() => StoredFile, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  createStoredFile(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateStoredFileInput) {
    return this.generatedService.createStoredFile(info, input)
  }

  @Mutation(() => StoredFile, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  updateStoredFile(
    @Info() info: GraphQLResolveInfo,
    @Args('storedFileId') storedFileId: string,
    @Args('input') input: UpdateStoredFileInput,
  ) {
    return this.generatedService.updateStoredFile(info, storedFileId, input)
  }

  @Mutation(() => StoredFile, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  deleteStoredFile(@Args('storedFileId') storedFileId: string) {
    return this.generatedService.deleteStoredFile(storedFileId)
  }
}
