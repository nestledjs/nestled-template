import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import {
  LocalStorageService,
  S3StorageService,
  CloudinaryStorageService,
  ImageKitStorageService,
  GcsStorageService,
} from './providers'

/**
 * Storage Module
 * Provides all storage provider services
 */
@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageService,
    S3StorageService,
    CloudinaryStorageService,
    ImageKitStorageService,
    GcsStorageService,
  ],
  exports: [
    LocalStorageService,
    S3StorageService,
    CloudinaryStorageService,
    ImageKitStorageService,
    GcsStorageService,
  ],
})
export class StorageModule {}
