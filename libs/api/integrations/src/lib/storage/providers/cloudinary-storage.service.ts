import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary'
import { IStorageService, UploadOptions, UploadResult } from '../interfaces'
import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'

/**
 * Cloudinary Storage Provider
 * Best for image/video storage with automatic optimization and transformations
 *
 * Required environment variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 *
 * Features:
 * - Automatic image optimization
 * - On-the-fly transformations (resize, crop, format)
 * - Built-in CDN delivery
 * - Support for width, height, quality, format options
 */
@Injectable()
export class CloudinaryStorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(CloudinaryStorageService.name)
  private readonly cloudName!: string
  private readonly isActiveProvider: boolean

  constructor(private readonly configService: ConfigService) {
    const storageProvider = this.configService.get<string>('STORAGE_PROVIDER', 'local')
    this.isActiveProvider = storageProvider === 'cloudinary'
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME')
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY')
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET')

    // Only validate credentials if Cloudinary is the active storage provider
    if (storageProvider === 'cloudinary' && (!cloudName || !apiKey || !apiSecret)) {
      throw new Error('Cloudinary credentials not configured. Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET')
    }

    // Skip initialization if not the active provider
    if (storageProvider !== 'cloudinary') {
      return
    }

    // After validation, we know these values are defined
    this.cloudName = cloudName!
    cloudinary.config({
      cloud_name: cloudName!,
      api_key: apiKey!,
      api_secret: apiSecret!,
    })
  }

  async onModuleInit() {
    if (!this.isActiveProvider) return
    this.logger.log(`Cloudinary Storage initialized: cloud=${this.cloudName}`)
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const ext = path.extname(options.filename)
    const name = path.basename(options.filename, ext)
    const uniqueFilename = `${name}-${uuidv4().split('-')[0]}`

    // Build public_id (path in Cloudinary)
    const publicId = options.folder
      ? `${options.folder}/${uniqueFilename}`
      : uniqueFilename

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: options.folder,
          resource_type: this.getResourceType(options.mimeType),
          type: options.isPublic ? 'upload' : 'authenticated',
          context: {
            ...(options.userId && { userId: options.userId }),
            ...(options.organizationId && { organizationId: options.organizationId }),
            ...(options.metadata && options.metadata),
          },
          // Apply transformation options if provided
          ...(options.width && { width: options.width }),
          ...(options.height && { height: options.height }),
          ...(options.quality && { quality: options.quality }),
          ...(options.format && { format: options.format }),
        },
        (error, result) => {
          if (error) {
            this.logger.error('Cloudinary upload failed', error)
            return reject(error)
          }

          if (!result) {
            return reject(new Error('Cloudinary upload succeeded but no result returned'))
          }

          const uploadResult: UploadResult = {
            id: uuidv4(),
            provider: 'cloudinary',
            providerFileId: result.public_id,
            url: result.secure_url,
            publicUrl: options.isPublic ? result.secure_url : undefined,
            filename: `${uniqueFilename}${ext}`,
            mimeType: options.mimeType,
            size: result.bytes,
            folder: options.folder,
            width: result.width,
            height: result.height,
            metadata: {
              ...options.metadata,
              format: result.format,
              resourceType: result.resource_type,
            },
          }

          resolve(uploadResult)
        }
      )

      uploadStream.end(buffer)
    })
  }

  async delete(providerFileId: string): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(providerFileId)
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new Error(`Cloudinary delete failed: ${result.result}`)
      }
    } catch (error) {
      this.logger.error(`Failed to delete file from Cloudinary: ${providerFileId}`, error)
      throw error
    }
  }

  async getUrl(providerFileId: string): Promise<string> {
    // Generate secure URL for the asset
    return cloudinary.url(providerFileId, {
      secure: true,
      resource_type: 'auto',
    })
  }

  async getSignedUrl(providerFileId: string, expiresIn: number): Promise<string> {
    // Cloudinary signed URLs use a different approach
    // expiresIn is in seconds
    const expirationTimestamp = Math.floor(Date.now() / 1000) + expiresIn

    return cloudinary.url(providerFileId, {
      secure: true,
      resource_type: 'auto',
      type: 'authenticated',
      sign_url: true,
      expires_at: expirationTimestamp,
    })
  }

  async exists(providerFileId: string): Promise<boolean> {
    try {
      await cloudinary.api.resource(providerFileId)
      return true
    } catch (error) {
      // Check if error is a 404 (resource not found)
      if (error && typeof error === 'object' && 'error' in error) {
        const apiError = error.error as { http_code?: number }
        if (apiError?.http_code === 404) {
          return false
        }
      }
      throw error
    }
  }

  getProviderName(): string {
    return 'cloudinary'
  }

  /**
   * Determine Cloudinary resource type based on MIME type
   */
  private getResourceType(mimeType: string): 'image' | 'video' | 'raw' {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    return 'raw'
  }
}
