import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Storage, Bucket } from '@google-cloud/storage'
import { IStorageService, UploadOptions, UploadResult } from '../interfaces'
import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'

/**
 * Google Cloud Storage Provider
 * Enterprise-grade storage with Google Cloud ecosystem integration
 *
 * Required environment variables:
 * - GCS_PROJECT_ID
 * - GCS_BUCKET
 * - GCS_KEY_FILE (path to service account key JSON)
 *   OR
 * - GOOGLE_APPLICATION_CREDENTIALS (standard Google Cloud env var)
 *
 * Features:
 * - Signed URL generation
 * - Public and private buckets
 * - Metadata support
 * - Integration with Google Cloud ecosystem
 */
@Injectable()
export class GcsStorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(GcsStorageService.name)
  private readonly storage!: Storage
  private readonly bucket!: Bucket
  private readonly bucketName!: string
  private readonly cdnUrl?: string
  private readonly isActiveProvider: boolean

  constructor(private readonly configService: ConfigService) {
    const storageProvider = this.configService.get<string>('STORAGE_PROVIDER', 'local')
    this.isActiveProvider = storageProvider === 'gcs'
    const projectId = this.configService.get<string>('GCS_PROJECT_ID')
    const bucketName = this.configService.get<string>('GCS_BUCKET')
    const keyFilename = this.configService.get<string>('GCS_KEY_FILE')
    this.cdnUrl = this.configService.get<string>('GCS_CDN_URL')

    // Only validate credentials if GCS is the active storage provider
    if (storageProvider === 'gcs' && (!projectId || !bucketName)) {
      throw new Error('Google Cloud Storage not configured. Required: GCS_PROJECT_ID, GCS_BUCKET')
    }

    // Skip initialization if not the active provider
    if (storageProvider !== 'gcs') {
      return
    }

    // After validation, we know these values are defined
    this.bucketName = bucketName!
    this.storage = new Storage({
      projectId: projectId!,
      ...(keyFilename && { keyFilename }),
    })

    this.bucket = this.storage.bucket(bucketName!)
  }

  async onModuleInit() {
    if (!this.isActiveProvider) return
    this.logger.log(`Google Cloud Storage initialized: bucket=${this.bucketName}`)
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const ext = path.extname(options.filename)
    const name = path.basename(options.filename, ext)
    const uniqueFilename = `${name}-${uuidv4().split('-')[0]}${ext}`

    // Build the GCS blob name (path in bucket)
    const blobName = options.folder
      ? `${options.folder}/${uniqueFilename}`
      : uniqueFilename

    const blob = this.bucket.file(blobName)

    try {
      await blob.save(buffer, {
        contentType: options.mimeType,
        metadata: {
          metadata: {
            ...(options.userId && { userId: options.userId }),
            ...(options.organizationId && { organizationId: options.organizationId }),
            ...(options.width && { width: String(options.width) }),
            ...(options.height && { height: String(options.height) }),
            ...(options.metadata && this.stringifyMetadata(options.metadata)),
          },
        },
        public: options.isPublic,
      })

      const url = await this.getUrl(blobName)
      const publicUrl = options.isPublic ? `https://storage.googleapis.com/${this.bucketName}/${blobName}` : undefined

      return {
        id: uuidv4(),
        provider: 'gcs',
        providerFileId: blobName,
        url,
        publicUrl,
        filename: uniqueFilename,
        mimeType: options.mimeType,
        size: buffer.length,
        folder: options.folder,
        width: options.width,
        height: options.height,
        metadata: options.metadata,
      }
    } catch (error) {
      this.logger.error('GCS upload failed', error)
      throw error
    }
  }

  async delete(providerFileId: string): Promise<void> {
    try {
      await this.bucket.file(providerFileId).delete()
    } catch (error) {
      this.logger.error(`Failed to delete file from GCS: ${providerFileId}`, error)
      throw error
    }
  }

  async getUrl(providerFileId: string): Promise<string> {
    // Use CDN URL if configured
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${providerFileId}`
    }

    // Use direct GCS URL
    return `https://storage.googleapis.com/${this.bucketName}/${providerFileId}`
  }

  async getSignedUrl(providerFileId: string, expiresIn: number): Promise<string> {
    const file = this.bucket.file(providerFileId)

    try {
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000, // Convert seconds to milliseconds
      })

      return signedUrl
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for file: ${providerFileId}`, error)
      throw error
    }
  }

  async exists(providerFileId: string): Promise<boolean> {
    try {
      const [exists] = await this.bucket.file(providerFileId).exists()
      return exists
    } catch (error) {
      this.logger.error(`Failed to check if file exists: ${providerFileId}`, error)
      return false
    }
  }

  getProviderName(): string {
    return 'gcs'
  }

  /**
   * Convert metadata to string values for GCS
   */
  private stringifyMetadata(metadata: Record<string, any>): Record<string, string> {
    const stringified: Record<string, string> = {}
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== null && value !== undefined) {
        stringified[key] = typeof value === 'string' ? value : JSON.stringify(value)
      }
    }
    return stringified
  }
}
