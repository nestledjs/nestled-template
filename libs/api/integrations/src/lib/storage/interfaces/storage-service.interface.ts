import { UploadOptions } from './upload-options.interface'
import { UploadResult } from './upload-result.interface'

/**
 * Abstract interface for file storage providers
 * Implement this interface to add support for new storage backends
 */
export interface IStorageService {
  upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult>
  delete(providerFileId: string): Promise<void>
  getUrl(providerFileId: string): Promise<string>
  getSignedUrl(providerFileId: string, expiresIn: number): Promise<string>
  exists(providerFileId: string): Promise<boolean>
  getProviderName(): string
}
