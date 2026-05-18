import { Module } from '@nestjs/common'
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
