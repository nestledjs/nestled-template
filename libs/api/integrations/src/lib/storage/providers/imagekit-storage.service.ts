import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import ImageKit from 'imagekit'
import { IStorageService, UploadOptions, UploadResult } from '../interfaces'
import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'

/**
 * ImageKit Storage Provider
 * Real-time image optimization with smart cropping and resizing
 *
 * Required environment variables:
 * - IMAGEKIT_PUBLIC_KEY
 * - IMAGEKIT_PRIVATE_KEY
 * - IMAGEKIT_URL_ENDPOINT (e.g., https://ik.imagekit.io/your-id)
 *
 * Features:
 * - Real-time image optimization
 * - Smart cropping and resizing
 * - CDN delivery
 * - Better developer experience than Cloudinary
 * - Built-in image analysis
 */
@Injectable()
export class ImageKitStorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(ImageKitStorageService.name)
  private readonly imagekit!: ImageKit
  private readonly urlEndpoint!: string
  private readonly isActiveProvider: boolean

  constructor(private readonly configService: ConfigService) {
    const storageProvider = this.configService.get<string>('STORAGE_PROVIDER', 'local')
    this.isActiveProvider = storageProvider === 'imagekit'
    const publicKey = this.configService.get<string>('IMAGEKIT_PUBLIC_KEY')
    const privateKey = this.configService.get<string>('IMAGEKIT_PRIVATE_KEY')
    const urlEndpoint = this.configService.get<string>('IMAGEKIT_URL_ENDPOINT')

    // Only validate credentials if ImageKit is the active storage provider
    if (storageProvider === 'imagekit' && (!publicKey || !privateKey || !urlEndpoint)) {
      throw new Error('ImageKit credentials not configured. Required: IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT')
    }

    // Skip initialization if not the active provider
    if (storageProvider !== 'imagekit') {
      return
    }

    // After validation, we know these values are defined
    this.urlEndpoint = urlEndpoint!
    this.imagekit = new ImageKit({
      publicKey: publicKey!,
      privateKey: privateKey!,
      urlEndpoint: urlEndpoint!,
    })
  }

  async onModuleInit() {
    if (!this.isActiveProvider) return
    this.logger.log(`ImageKit Storage initialized: endpoint=${this.urlEndpoint}`)
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const ext = path.extname(options.filename)
    const name = path.basename(options.filename, ext)
    const uniqueFilename = `${name}-${uuidv4().split('-')[0]}${ext}`

    try {
      const result = await this.imagekit.upload({
        file: buffer,
        fileName: uniqueFilename,
        folder: options.folder,
        useUniqueFileName: false, // We already made it unique
        isPrivateFile: !options.isPublic,
        // Note: customMetadata and transformation are omitted
        // - customMetadata requires pre-defined fields in ImageKit dashboard
        // - transformation on upload is limited; use URL transformations instead
        // We store metadata in our database instead
      })

      return {
        id: uuidv4(),
        provider: 'imagekit',
        providerFileId: result.fileId,
        url: result.url,
        publicUrl: options.isPublic ? result.url : undefined,
        filename: uniqueFilename,
        mimeType: options.mimeType,
        size: result.size,
        folder: options.folder,
        width: result.width,
        height: result.height,
        metadata: {
          ...options.metadata,
          fileType: result.fileType,
          thumbnailUrl: result.thumbnailUrl,
        },
      }
    } catch (error) {
      this.logger.error('ImageKit upload failed', error)
      throw error
    }
  }

  async delete(providerFileId: string): Promise<void> {
    try {
      await this.imagekit.deleteFile(providerFileId)
    } catch (error) {
      this.logger.error(`Failed to delete file from ImageKit: ${providerFileId}`, error)
      throw error
    }
  }

  async getUrl(providerFileId: string): Promise<string> {
    try {
      const fileDetails = await this.imagekit.getFileDetails(providerFileId)
      return fileDetails.url
    } catch (error) {
      this.logger.error(`Failed to get URL for file: ${providerFileId}`, error)
      throw error
    }
  }

  async getSignedUrl(providerFileId: string, expiresIn: number): Promise<string> {
    try {
      const fileDetails = await this.imagekit.getFileDetails(providerFileId)

      // Calculate expiration timestamp (ImageKit uses Unix timestamp in seconds)
      const expireSeconds = Math.floor(Date.now() / 1000) + expiresIn

      return this.imagekit.url({
        src: fileDetails.url,
        signed: true,
        expireSeconds,
      })
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for file: ${providerFileId}`, error)
      throw error
    }
  }

  async exists(providerFileId: string): Promise<boolean> {
    try {
      await this.imagekit.getFileDetails(providerFileId)
      return true
    } catch (error) {
      // Check if error indicates file not found
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
        return false
      }
      throw error
    }
  }

  getProviderName(): string {
    return 'imagekit'
  }

  /**
   * Build ImageKit transformation options
   */
  private buildTransformation(options: UploadOptions): { pre?: string } | undefined {
    const transformations: string[] = []

    if (options.width) {
      transformations.push(`w-${options.width}`)
    }

    if (options.height) {
      transformations.push(`h-${options.height}`)
    }

    if (options.quality) {
      transformations.push(`q-${options.quality}`)
    }

    if (options.format) {
      transformations.push(`f-${options.format}`)
    }

    if (transformations.length === 0) {
      return undefined
    }

    return {
      pre: transformations.join(','),
    }
  }

  /**
   * Convert metadata to string values for ImageKit
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
