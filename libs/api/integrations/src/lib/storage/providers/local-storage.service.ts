import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IStorageService, UploadOptions, UploadResult } from '../interfaces'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { v4 as uuidv4 } from 'uuid'

/**
 * ⚠️ WARNING: FOR DEVELOPMENT ONLY
 * Files will be lost on deployment restart (Heroku, Railway, Docker, etc.)
 * For production, use: S3, Cloudinary, ImageKit, or GCS
 */
@Injectable()
export class LocalStorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(LocalStorageService.name)
  private readonly storagePath: string
  private readonly baseUrl: string
  private readonly isActiveProvider: boolean

  constructor(private readonly configService: ConfigService) {
    this.storagePath = this.configService.get<string>('LOCAL_STORAGE_PATH', './uploads')
    this.baseUrl = this.configService.get<string>('API_URL', 'http://localhost:3000')
    this.isActiveProvider = this.configService.get<string>('STORAGE_PROVIDER', 'local') === 'local'
  }

  async onModuleInit() {
    // Only initialize and warn if local storage is the active provider
    if (!this.isActiveProvider) {
      return
    }
    await this.ensureDirectory(this.storagePath)
    this.logger.warn('⚠️  WARNING: Using local storage - files will be lost on restart!')
    this.logger.warn(
      '⚠️  For production, set STORAGE_PROVIDER to: s3, cloudinary, imagekit, or gcs',
    )
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath)
    } catch {
      await fs.mkdir(dirPath, { recursive: true })
    }
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    let fullPath = this.storagePath
    if (options.folder) {
      fullPath = path.join(fullPath, options.folder)
      await this.ensureDirectory(fullPath)
    }

    const ext = path.extname(options.filename)
    const name = path.basename(options.filename, ext)
    const uniqueFilename = `${name}-${uuidv4().split('-')[0]}${ext}`
    const filePath = path.join(fullPath, uniqueFilename)
    const relativeFilePath = options.folder ? `${options.folder}/${uniqueFilename}` : uniqueFilename

    await fs.writeFile(filePath, buffer)
    const stats = await fs.stat(filePath)

    return {
      id: uuidv4(),
      provider: 'local',
      providerFileId: relativeFilePath,
      url: `${this.baseUrl}/uploads/${relativeFilePath}`,
      publicUrl: `${this.baseUrl}/uploads/${relativeFilePath}`,
      filename: uniqueFilename,
      mimeType: options.mimeType,
      size: stats.size,
      folder: options.folder,
      width: options.width,
      height: options.height,
      metadata: options.metadata,
    }
  }

  async delete(providerFileId: string): Promise<void> {
    const filePath = path.join(this.storagePath, providerFileId)
    try {
      await fs.unlink(filePath)
    } catch (error) {
      // Ignore ENOENT (file not found) errors, throw others
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  async getUrl(providerFileId: string): Promise<string> {
    return `${this.baseUrl}/uploads/${providerFileId}`
  }

  async getSignedUrl(providerFileId: string, expiresIn: number): Promise<string> {
    return this.getUrl(providerFileId) // Local storage doesn't support true signed URLs
  }

  async exists(providerFileId: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.storagePath, providerFileId))
      return true
    } catch {
      return false
    }
  }

  getProviderName(): string {
    return 'local'
  }
}
