import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { IStorageService, UploadOptions, UploadResult } from '../interfaces'
import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'

/**
 * AWS S3 Storage Provider
 * Supports AWS S3 and S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
 *
 * Required environment variables:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_S3_BUCKET
 * - AWS_S3_REGION (default: us-east-1)
 *
 * Optional:
 * - AWS_S3_ENDPOINT (for S3-compatible services)
 * - AWS_S3_FORCE_PATH_STYLE (true for MinIO)
 */
@Injectable()
export class S3StorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name)
  private readonly s3Client!: S3Client
  private readonly bucket!: string
  private readonly region: string
  private readonly cdnUrl?: string
  private readonly isActiveProvider: boolean

  constructor(private readonly configService: ConfigService) {
    const storageProvider = this.configService.get<string>('STORAGE_PROVIDER', 'local')
    this.isActiveProvider = storageProvider === 's3'
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID')
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY')
    const bucket = this.configService.get<string>('AWS_S3_BUCKET')
    this.region = this.configService.get<string>('AWS_S3_REGION', 'us-east-1')
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT')
    const forcePathStyle = this.configService.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true'
    this.cdnUrl = this.configService.get<string>('AWS_S3_CDN_URL')

    // Only validate credentials if S3 is the active storage provider
    if (storageProvider === 's3' && (!accessKeyId || !secretAccessKey || !bucket)) {
      throw new Error('AWS S3 credentials not configured. Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET')
    }

    // Skip initialization if not the active provider
    if (storageProvider !== 's3') {
      return
    }

    // After validation, we know these values are defined
    this.bucket = bucket!
    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
      endpoint,
      forcePathStyle,
    })
  }

  async onModuleInit() {
    if (!this.isActiveProvider) return
    this.logger.log(`S3 Storage initialized: bucket=${this.bucket}, region=${this.region}`)
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const ext = path.extname(options.filename)
    const name = path.basename(options.filename, ext)
    const uniqueFilename = `${name}-${uuidv4().split('-')[0]}${ext}`

    // Build the S3 key (path in bucket)
    const key = options.folder
      ? `${options.folder}/${uniqueFilename}`
      : uniqueFilename

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: options.mimeType,
      ACL: options.isPublic ? 'public-read' : 'private',
      Metadata: {
        ...(options.userId && { userId: options.userId }),
        ...(options.organizationId && { organizationId: options.organizationId }),
        ...(options.metadata && this.flattenMetadata(options.metadata)),
      },
      ...(options.width && { Metadata: { ...options.metadata, width: String(options.width) } }),
      ...(options.height && { Metadata: { ...options.metadata, height: String(options.height) } }),
    })

    await this.s3Client.send(command)

    const url = await this.getUrl(key)
    const publicUrl = options.isPublic ? url : undefined

    return {
      id: uuidv4(),
      provider: 's3',
      providerFileId: key,
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
  }

  async delete(providerFileId: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: providerFileId,
    })

    try {
      await this.s3Client.send(command)
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${providerFileId}`, error)
      throw error
    }
  }

  async getUrl(providerFileId: string): Promise<string> {
    // Use CDN URL if configured
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${providerFileId}`
    }

    // Use direct S3 URL
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT')
    if (endpoint) {
      return `${endpoint}/${this.bucket}/${providerFileId}`
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${providerFileId}`
  }

  async getSignedUrl(providerFileId: string, expiresIn: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: providerFileId,
    })

    return getSignedUrl(this.s3Client, command, { expiresIn })
  }

  async exists(providerFileId: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: providerFileId,
      })
      await this.s3Client.send(command)
      return true
    } catch (error) {
      // Check if error is NotFound (file doesn't exist)
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
        return false
      }
      if (error && typeof error === 'object' && '$metadata' in error) {
        const metadata = error.$metadata as { httpStatusCode?: number }
        if (metadata.httpStatusCode === 404) {
          return false
        }
      }
      throw error
    }
  }

  getProviderName(): string {
    return 's3'
  }

  /**
   * Flatten metadata to string key-value pairs for S3
   * S3 metadata values must be strings
   */
  private flattenMetadata(metadata: Record<string, any>): Record<string, string> {
    const flattened: Record<string, string> = {}
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== null && value !== undefined) {
        flattened[key] = typeof value === 'string' ? value : JSON.stringify(value)
      }
    }
    return flattened
  }
}
