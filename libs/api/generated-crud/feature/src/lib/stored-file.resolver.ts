import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver, Info } from '@nestjs/graphql'
import type { GraphQLResolveInfo } from 'graphql'
import { CorePaging } from '@nestled-template/api/core/data-access'
import { StoredFile } from '@nestled-template/api/core/models'
import {
  ApiCrudDataAccessService,
  CreateStoredFileInput,
  ListStoredFileInput,
  UpdateStoredFileInput,
} from '@nestled-template/api/generated-crud/data-access'
import {
  AdminOnly,
  GqlAuthAdminGuard,
  RequirePlatformPermissionUnderClassGuard,
} from '@nestled-template/api/utils'

@Resolver(() => StoredFile)
@UseGuards(GqlAuthAdminGuard)
@AdminOnly()
export class GeneratedStoredFileResolver {
  constructor(private readonly generatedService: ApiCrudDataAccessService) {}

  @Query(() => [StoredFile], { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  storedFiles(
    @Info() info: GraphQLResolveInfo,
    @Args({ name: 'input', type: () => ListStoredFileInput, nullable: true })
    input?: ListStoredFileInput,
  ) {
    return this.generatedService.storedFiles(info, input)
  }

  @Query(() => CorePaging, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  storedFilesCount(
    @Args({ name: 'input', type: () => ListStoredFileInput, nullable: true })
    input?: ListStoredFileInput,
  ) {
    return this.generatedService.storedFilesCount(input)
  }

  @Query(() => StoredFile, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.read')
  storedFile(@Info() info: GraphQLResolveInfo, @Args('storedFileId') storedFileId: string) {
    return this.generatedService.storedFile(info, storedFileId)
  }

  @Mutation(() => StoredFile, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  createStoredFile(@Info() info: GraphQLResolveInfo, @Args('input') input: CreateStoredFileInput) {
    return this.generatedService.createStoredFile(info, input)
  }

  @Mutation(() => StoredFile, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  updateStoredFile(
    @Info() info: GraphQLResolveInfo,
    @Args('storedFileId') storedFileId: string,
    @Args('input') input: UpdateStoredFileInput,
  ) {
    return this.generatedService.updateStoredFile(info, storedFileId, input)
  }

  @Mutation(() => StoredFile, { nullable: true })
  @RequirePlatformPermissionUnderClassGuard('platform.data-browser.manage')
  deleteStoredFile(@Args('storedFileId') storedFileId: string) {
    return this.generatedService.deleteStoredFile(storedFileId)
  }
}
