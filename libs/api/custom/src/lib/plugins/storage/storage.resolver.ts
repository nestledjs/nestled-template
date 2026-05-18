import { Resolver, Mutation, Query, Args, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import {
  CtxOrganizationId,
  CtxUser,
  GqlAuthGuard,
  GqlOrganizationScopedGuard,
} from '@nestled-template/api/utils'
import { User, StoredFile } from '@nestled-template/api/core/models'
import { StorageService } from './storage.service'
import { UploadedFile } from './models/upload.model'
import { GraphQLUpload, FileUpload } from 'graphql-upload-minimal'

/**
 * Storage GraphQL Resolver
 * Provides mutations and queries for file uploads
 */
@Resolver(() => UploadedFile)
@UseGuards(GqlAuthGuard)
export class StorageResolver {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Upload a file
   */
  @Mutation(() => UploadedFile)
  async uploadFile(
    @Args({ name: 'file', type: () => GraphQLUpload }) file: FileUpload,
    @Args('folder', { type: () => String, nullable: true }) folder: string | undefined,
    @CtxUser() user: User,
  ): Promise<StoredFile> {
    return this.storageService.uploadFile(file, user.id, { folder })
  }

  /**
   * Upload user avatar
   */
  @Mutation(() => UploadedFile)
  async uploadUserAvatar(
    @Args({ name: 'file', type: () => GraphQLUpload }) file: FileUpload,
    @CtxUser() user: User,
  ): Promise<StoredFile> {
    return this.storageService.uploadUserAvatar(file, user.id)
  }

  /**
   * Upload organization logo
   */
  @Mutation(() => UploadedFile)
  @UseGuards(GqlOrganizationScopedGuard)
  async uploadOrganizationLogo(
    @Args({ name: 'file', type: () => GraphQLUpload }) file: FileUpload,
    @CtxOrganizationId() organizationId: string,
    @CtxUser() user: User,
  ): Promise<StoredFile> {
    return this.storageService.uploadOrganizationLogo(file, user.id, organizationId)
  }

  /**
   * Delete a file
   */
  @Mutation(() => Boolean)
  async deleteFile(
    @Args('uploadId', { type: () => String }) uploadId: string,
    @CtxUser() user: User,
  ): Promise<boolean> {
    await this.storageService.deleteFile(uploadId, user.id)
    return true
  }

  /**
   * Remove the authenticated user's avatar
   */
  @Mutation(() => Boolean)
  async removeUserAvatar(@CtxUser() user: User): Promise<boolean> {
    await this.storageService.removeUserAvatar(user.id)
    return true
  }

  /**
   * Remove an organization's logo (requires org membership)
   */
  @Mutation(() => Boolean)
  @UseGuards(GqlOrganizationScopedGuard)
  async removeOrganizationLogo(
    @CtxOrganizationId() organizationId: string,
    @CtxUser() user: User,
  ): Promise<boolean> {
    await this.storageService.removeOrganizationLogo(organizationId, user.id)
    return true
  }

  /**
   * Get signed URL for temporary access to a private file
   */
  @Query(() => String)
  async getSignedUrl(
    @Args('uploadId', { type: () => String }) uploadId: string,
    @Args('expiresIn', { type: () => Int, nullable: true }) expiresIn: number | undefined,
  ): Promise<string> {
    return this.storageService.getSignedUrl(uploadId, expiresIn)
  }

  /**
   * Get all files for the authenticated user
   */
  @Query(() => [UploadedFile])
  async userFiles(
    @Args('limit', { type: () => Int, nullable: true }) limit: number | undefined,
    @Args('offset', { type: () => Int, nullable: true }) offset: number | undefined,
    @CtxUser() user: User,
  ): Promise<StoredFile[]> {
    return this.storageService.getUserFiles(user.id, limit, offset)
  }

  /**
   * Get all files for an organization
   */
  @Query(() => [UploadedFile])
  async organizationFiles(
    @Args('organizationId', { type: () => String }) organizationId: string,
    @Args('limit', { type: () => Int, nullable: true }) limit: number | undefined,
    @Args('offset', { type: () => Int, nullable: true }) offset: number | undefined,
  ): Promise<StoredFile[]> {
    return this.storageService.getOrganizationFiles(organizationId, limit, offset)
  }
}
