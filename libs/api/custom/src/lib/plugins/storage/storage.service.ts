import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { StoredFile, StorageProvider } from '@nestled-template/api/prisma'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { StorageFactory } from './storage.factory'
import { FileUpload } from 'graphql-upload-minimal'

/**
 * Storage Orchestrator Service
 * High-level file management with database persistence
 *
 * This service:
 * 1. Accepts file uploads via GraphQL
 * 2. Uploads to the configured storage provider
 * 3. Persists file metadata to database
 * 4. Provides convenient methods for common upload scenarios
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)

  constructor(
    private readonly prisma: ApiCoreDataAccessService,
    private readonly storageFactory: StorageFactory,
  ) {}

  /**
   * Upload a file and persist metadata to database
   */
  async uploadFile(
    fileUpload: FileUpload,
    userId: string,
    options?: {
      folder?: string
      organizationId?: string
      metadata?: Record<string, unknown>
      isPublic?: boolean
    },
  ): Promise<StoredFile> {
    const { createReadStream, filename, mimetype } = fileUpload

    // Convert stream to buffer
    const buffer = await this.streamToBuffer(createReadStream())

    const storageProvider = this.storageFactory.getStorageProvider()

    // Upload to storage provider
    const uploadResult = await storageProvider.upload(buffer, {
      filename,
      mimeType: mimetype,
      folder: options?.folder,
      isPublic: options?.isPublic ?? false,
      userId,
      organizationId: options?.organizationId,
      metadata: options?.metadata,
    })

    // Persist to database
    const upload = await this.prisma.storedFile.create({
      data: {
        provider: this.mapProviderNameToEnum(uploadResult.provider),
        providerFileId: uploadResult.providerFileId,
        folder: uploadResult.folder,
        filename: uploadResult.filename,
        originalName: filename,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        url: uploadResult.url,
        publicUrl: uploadResult.publicUrl,
        width: uploadResult.width,
        height: uploadResult.height,
        metadata: uploadResult.metadata,
        userId,
        organizationId: options?.organizationId,
      },
    })

    this.logger.log(`File uploaded successfully: ${upload.id} (${upload.filename})`)

    return upload
  }

  /**
   * Upload user avatar
   * Folder structure: user_avatars/{userId}/filename.ext
   * Uses FK pointer (user.avatarId) — deletes the exact old file, no metadata filtering
   */
  async uploadUserAvatar(fileUpload: FileUpload, userId: string): Promise<StoredFile> {
    // Read the current avatar FK before uploading
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarId: true },
    })

    // Upload new avatar first to prevent data loss if upload fails
    const newAvatar = await this.uploadFile(fileUpload, userId, {
      folder: `user_avatars/${userId}`,
      isPublic: true,
    })

    // Point the FK to the new file
    await this.prisma.user.update({ where: { id: userId }, data: { avatarId: newAvatar.id } })

    // Delete the old avatar file after the FK is updated
    if (user?.avatarId) {
      const oldFile = await this.prisma.storedFile.findUnique({ where: { id: user.avatarId } })
      if (oldFile) {
        try {
          const storageProvider = this.storageFactory.getProviderByName(
            oldFile.provider.toLowerCase(),
          )
          await storageProvider.delete(oldFile.providerFileId)
        } catch (error) {
          this.logger.warn(`Failed to delete old user avatar from provider: ${error}`)
        }
        await this.prisma.storedFile.delete({ where: { id: oldFile.id } })
      }
    }

    return newAvatar
  }

  /**
   * Upload organization logo
   * Folder structure: org_avatars/{organizationId}/filename.ext
   * Uses FK pointer (organization.logoId) — deletes the exact old file, no metadata filtering
   * Requires the user to be an Owner or Admin of the organization
   */
  async uploadOrganizationLogo(
    fileUpload: FileUpload,
    userId: string,
    organizationId: string,
  ): Promise<StoredFile> {
    await this.assertOrgAdminOrOwner(userId, organizationId)

    // Read the current logo FK before uploading
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoId: true },
    })

    // Upload new logo first to prevent data loss if upload fails
    const newLogo = await this.uploadFile(fileUpload, userId, {
      folder: `org_avatars/${organizationId}`,
      organizationId,
      isPublic: true,
    })

    // Point the FK to the new file
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { logoId: newLogo.id },
    })

    // Delete the old logo file after the FK is updated
    if (org?.logoId) {
      const oldFile = await this.prisma.storedFile.findUnique({ where: { id: org.logoId } })
      if (oldFile) {
        try {
          const storageProvider = this.storageFactory.getProviderByName(
            oldFile.provider.toLowerCase(),
          )
          await storageProvider.delete(oldFile.providerFileId)
        } catch (error) {
          this.logger.warn(`Failed to delete old organization logo from provider: ${error}`)
        }
        await this.prisma.storedFile.delete({ where: { id: oldFile.id } })
      }
    }

    return newLogo
  }

  /**
   * Delete a file from storage and database
   * Uses the correct provider per file and is resilient to provider errors
   */
  async deleteFile(uploadId: string, userId: string): Promise<void> {
    const upload = await this.prisma.storedFile.findUnique({
      where: { id: uploadId },
    })

    if (!upload) {
      throw new NotFoundException(`Upload not found: ${uploadId}`)
    }

    // Verify user owns the file
    if (upload.userId !== userId) {
      throw new NotFoundException(`Upload not found: ${uploadId}`)
    }

    // Use the correct provider for this specific file, not the default
    const providerName = upload.provider.toLowerCase()
    const storageProvider = this.storageFactory.getProviderByName(providerName)

    // Try to delete from provider, but don't fail if it errors
    try {
      await storageProvider.delete(upload.providerFileId)
    } catch (error) {
      this.logger.warn(
        `Failed to delete file ${uploadId} from storage provider ${upload.provider}: ${error}. ` +
          `Proceeding with database deletion.`,
      )
    }

    // Always delete from database
    await this.prisma.storedFile.delete({
      where: { id: uploadId },
    })

    this.logger.log(`File deleted successfully: ${uploadId}`)
  }

  /**
   * Get all files for a user
   */
  async getUserFiles(userId: string, limit = 50, offset = 0): Promise<StoredFile[]> {
    return this.prisma.storedFile.findMany({
      where: { userId },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Get all files for an organization
   */
  async getOrganizationFiles(
    organizationId: string,
    limit = 50,
    offset = 0,
  ): Promise<StoredFile[]> {
    return this.prisma.storedFile.findMany({
      where: { organizationId },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Remove the user's avatar — nulls avatarId and deletes the file
   */
  async removeUserAvatar(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarId: true },
    })
    if (!user?.avatarId) return

    const file = await this.prisma.storedFile.findUnique({ where: { id: user.avatarId } })

    // Null the FK first so onDelete: SetNull doesn't race with our explicit delete
    await this.prisma.user.update({ where: { id: userId }, data: { avatarId: null } })

    if (file) {
      try {
        const storageProvider = this.storageFactory.getProviderByName(file.provider.toLowerCase())
        await storageProvider.delete(file.providerFileId)
      } catch (error) {
        this.logger.warn(`Failed to delete user avatar from provider: ${error}`)
      }
      await this.prisma.storedFile.delete({ where: { id: file.id } })
    }
  }

  /**
   * Remove an organization's logo — requires Owner or Admin membership
   * Nulls logoId and deletes the file
   */
  async removeOrganizationLogo(organizationId: string, userId: string): Promise<void> {
    await this.assertOrgAdminOrOwner(userId, organizationId)

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoId: true },
    })
    if (!org?.logoId) return

    const file = await this.prisma.storedFile.findUnique({ where: { id: org.logoId } })

    // Null the FK first
    await this.prisma.organization.update({ where: { id: organizationId }, data: { logoId: null } })

    if (file) {
      try {
        const storageProvider = this.storageFactory.getProviderByName(file.provider.toLowerCase())
        await storageProvider.delete(file.providerFileId)
      } catch (error) {
        this.logger.warn(`Failed to delete organization logo from provider: ${error}`)
      }
      await this.prisma.storedFile.delete({ where: { id: file.id } })
    }
  }

  /**
   * Assert the user is an Owner or Admin of the given organization.
   * Throws ForbiddenException if not.
   */
  private async assertOrgAdminOrOwner(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId },
      select: { role: { select: { name: true } } },
    })

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization')
    }

    const roleName = membership.role.name
    if (roleName !== 'Owner' && roleName !== 'Admin') {
      throw new ForbiddenException('Only Owners and Admins can manage the organization logo')
    }
  }

  /**
   * Get a signed URL for temporary access to a private file
   */
  async getSignedUrl(uploadId: string, expiresIn = 3600): Promise<string> {
    const upload = await this.prisma.storedFile.findUnique({
      where: { id: uploadId },
    })

    if (!upload) {
      throw new NotFoundException(`Upload not found: ${uploadId}`)
    }

    const providerName = upload.provider.toLowerCase()
    const storageProvider = this.storageFactory.getProviderByName(providerName)
    return storageProvider.getSignedUrl(upload.providerFileId, expiresIn)
  }

  /**
   * Helper: Convert ReadStream to Buffer
   */
  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', chunk => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  /**
   * Helper: Map provider name string to Prisma enum
   */
  private mapProviderNameToEnum(providerName: string): StorageProvider {
    const upperName = providerName.toUpperCase()
    if (upperName in StorageProvider) {
      return StorageProvider[upperName as keyof typeof StorageProvider]
    }
    throw new Error(`Unknown storage provider: ${providerName}`)
  }
}
