import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { StorageFactory } from './storage.factory'
import {
  LocalStorageService,
  S3StorageService,
  CloudinaryStorageService,
  ImageKitStorageService,
  GcsStorageService,
} from '@nestled-template/api/integrations'
describe('StorageFactory', () => {
  let factory: StorageFactory
  let mockConfigService: jest.Mocked<ConfigService>
  let mockLocalStorage: jest.Mocked<LocalStorageService>
  let mockS3Storage: jest.Mocked<S3StorageService>
  let mockCloudinaryStorage: jest.Mocked<CloudinaryStorageService>
  let mockImagekitStorage: jest.Mocked<ImageKitStorageService>
  let mockGcsStorage: jest.Mocked<GcsStorageService>
  beforeEach(async () => {
    mockLocalStorage = {
      upload: jest.fn(),
      delete: jest.fn(),
      getUrl: jest.fn(),
    } as any
    mockS3Storage = {
      upload: jest.fn(),
      delete: jest.fn(),
      getUrl: jest.fn(),
    } as any
    mockCloudinaryStorage = {
      upload: jest.fn(),
      delete: jest.fn(),
      getUrl: jest.fn(),
    } as any
    mockImagekitStorage = {
      upload: jest.fn(),
      delete: jest.fn(),
      getUrl: jest.fn(),
    } as any
    mockGcsStorage = {
      upload: jest.fn(),
      delete: jest.fn(),
      getUrl: jest.fn(),
    } as any
    mockConfigService = {
      get: jest.fn(),
    } as any
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageFactory,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LocalStorageService, useValue: mockLocalStorage },
        { provide: S3StorageService, useValue: mockS3Storage },
        { provide: CloudinaryStorageService, useValue: mockCloudinaryStorage },
        { provide: ImageKitStorageService, useValue: mockImagekitStorage },
        { provide: GcsStorageService, useValue: mockGcsStorage },
      ],
    }).compile()
    factory = module.get<StorageFactory>(StorageFactory)
  })
  describe('getStorageProvider', () => {
    it('should return local storage provider when configured', () => {
      mockConfigService.get.mockReturnValue('local')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockLocalStorage)
      expect(mockConfigService.get).toHaveBeenCalledWith('STORAGE_PROVIDER', 'local')
    })
    it('should return S3 storage provider when configured', () => {
      mockConfigService.get.mockReturnValue('s3')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockS3Storage)
    })
    it('should return Cloudinary storage provider when configured', () => {
      mockConfigService.get.mockReturnValue('cloudinary')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockCloudinaryStorage)
    })
    it('should return ImageKit storage provider when configured', () => {
      mockConfigService.get.mockReturnValue('imagekit')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockImagekitStorage)
    })
    it('should return GCS storage provider when configured', () => {
      mockConfigService.get.mockReturnValue('gcs')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockGcsStorage)
    })
    it('should handle uppercase provider names', () => {
      mockConfigService.get.mockReturnValue('S3')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockS3Storage)
    })
    it('should handle mixed case provider names', () => {
      mockConfigService.get.mockReturnValue('Cloudinary')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockCloudinaryStorage)
    })
    it('should fall back to local storage for unknown provider', () => {
      mockConfigService.get.mockReturnValue('unknown-provider')
      const provider = factory.getStorageProvider()
      expect(provider).toBe(mockLocalStorage)
    })
    it('should cache the provider instance', () => {
      mockConfigService.get.mockReturnValue('s3')
      const provider1 = factory.getStorageProvider()
      const provider2 = factory.getStorageProvider()
      expect(provider1).toBe(provider2)
      expect(mockConfigService.get).toHaveBeenCalledTimes(1)
    })
    it('should default to local storage when provider is empty string', () => {
      mockConfigService.get.mockReturnValue('')
      const provider = factory.getStorageProvider()
      // Empty string falls back to local storage via the unknown provider path
      expect(provider).toBe(mockLocalStorage)
    })
  })
})
