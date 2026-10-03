import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  IStorageService,
  LocalStorageService,
  S3StorageService,
  CloudinaryStorageService,
  ImageKitStorageService,
  GcsStorageService,
} from '@nestled-template/api/integrations'

/**
 * Storage Factory
 * Creates the appropriate storage provider based on STORAGE_PROVIDER environment variable
 *
 * Supported providers:
 * - local: Local filesystem storage (DEV ONLY - files lost on restart)
 * - s3: AWS S3 and S3-compatible services (MinIO, DigitalOcean Spaces)
 * - cloudinary: Cloudinary image/video storage with transformations
 * - imagekit: ImageKit image optimization and CDN
 * - gcs: Google Cloud Storage
 */
@Injectable()
export class StorageFactory {
  private readonly logger = new Logger(StorageFactory.name)
  private cachedProvider: IStorageService | null = null

  constructor(
    private readonly configService: ConfigService,
    private readonly localStorage: LocalStorageService,
    private readonly s3Storage: S3StorageService,
    private readonly cloudinaryStorage: CloudinaryStorageService,
    private readonly imagekitStorage: ImageKitStorageService,
    private readonly gcsStorage: GcsStorageService,
  ) {}

  /**
   * Get a storage provider by name, regardless of the configured default.
   * Used when deleting files that may have been stored with a different provider.
   */
  getProviderByName(name: string): IStorageService {
    switch (name.toLowerCase()) {
      case 'local':
        return this.localStorage
      case 's3':
        return this.s3Storage
      case 'cloudinary':
        return this.cloudinaryStorage
      case 'imagekit':
        return this.imagekitStorage
      case 'gcs':
        return this.gcsStorage
      default:
        this.logger.warn(`Unknown provider name: ${name}. Falling back to default provider.`)
        return this.getStorageProvider()
    }
  }

  /**
   * Get the configured storage provider
   * Caches the provider instance after first creation
   */
  getStorageProvider(): IStorageService {
    if (this.cachedProvider) {
      return this.cachedProvider
    }

    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'local').toLowerCase()

    this.logger.log(`Initializing storage provider: ${provider}`)

    switch (provider) {
      case 'local':
        this.cachedProvider = this.localStorage
        break
      case 's3':
        this.cachedProvider = this.s3Storage
        break
      case 'cloudinary':
        this.cachedProvider = this.cloudinaryStorage
        break
      case 'imagekit':
        this.cachedProvider = this.imagekitStorage
        break
      case 'gcs':
        this.cachedProvider = this.gcsStorage
        break
      default:
        this.logger.error(`Unknown storage provider: ${provider}. Falling back to local storage.`)
        this.cachedProvider = this.localStorage
    }

    return this.cachedProvider
  }
}
