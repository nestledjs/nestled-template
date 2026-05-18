import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { StorageService } from './storage.service'
import { StorageProvider } from '@nestled-template/api/prisma'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { StorageFactory } from './storage.factory'
import { Readable } from 'node:stream'
describe('StorageService', () => {
  let service: StorageService
  let mockPrisma: any
  let mockStorageFactory: any
  let mockStorageProvider: any
  beforeEach(async () => {
    mockStorageProvider = {
      upload: jest.fn(),
      delete: jest.fn(),
      getSignedUrl: jest.fn(),
    }
    mockStorageFactory = {
      getStorageProvider: jest.fn().mockReturnValue(mockStorageProvider),
      getProviderByName: jest.fn().mockReturnValue(mockStorageProvider),
    }
    mockPrisma = {
      storedFile: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      organizationMember: {
        findFirst: jest.fn(),
      },
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockPrisma,
        },
        {
          provide: StorageFactory,
          useValue: mockStorageFactory,
        },
      ],
    }).compile()
    service = module.get<StorageService>(StorageService)
  })
  describe('uploadFile', () => {
    it('should upload a file and persist metadata', async () => {
      const mockFileUpload = {
        filename: 'test.jpg',
        mimetype: 'image/jpeg',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('test content'))
          stream.push(null)
          return stream
        },
      }
      const mockUploadResult = {
        provider: 'local',
        providerFileId: 'file-123',
        folder: 'uploads',
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 12,
        url: '/uploads/test.jpg',
        publicUrl: null,
        width: null,
        height: null,
        metadata: {},
      }
      const mockStoredFile = {
        id: 'stored-123',
        provider: StorageProvider.LOCAL,
        providerFileId: 'file-123',
        filename: 'test.jpg',
        originalName: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 12,
        url: '/uploads/test.jpg',
        userId: 'user-123',
      }
      mockStorageProvider.upload.mockResolvedValue(mockUploadResult)
      mockPrisma.storedFile.create.mockResolvedValue(mockStoredFile as any)
      const result = await service.uploadFile(mockFileUpload as any, 'user-123')
      expect(result).toEqual(mockStoredFile)
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          filename: 'test.jpg',
          mimeType: 'image/jpeg',
          isPublic: false,
          userId: 'user-123',
        }),
      )
      expect(mockPrisma.storedFile.create).toHaveBeenCalled()
    })
    it('should upload file with folder option', async () => {
      const mockFileUpload = {
        filename: 'avatar.png',
        mimetype: 'image/png',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('avatar'))
          stream.push(null)
          return stream
        },
      }
      mockStorageProvider.upload.mockResolvedValue({
        provider: 'local',
        providerFileId: 'avatar-123',
        folder: 'avatars',
        filename: 'avatar.png',
        mimeType: 'image/png',
        size: 6,
        url: '/avatars/avatar.png',
      })
      mockPrisma.storedFile.create.mockResolvedValue({
        id: 'stored-avatar',
        folder: 'avatars',
      } as any)
      await service.uploadFile(mockFileUpload as any, 'user-123', {
        folder: 'avatars',
      })
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          folder: 'avatars',
        }),
      )
    })
    it('should upload file with organizationId option', async () => {
      const mockFileUpload = {
        filename: 'logo.png',
        mimetype: 'image/png',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('logo'))
          stream.push(null)
          return stream
        },
      }
      mockStorageProvider.upload.mockResolvedValue({
        provider: 'local',
        providerFileId: 'logo-123',
        filename: 'logo.png',
        mimeType: 'image/png',
        size: 4,
        url: '/logos/logo.png',
      })
      mockPrisma.storedFile.create.mockResolvedValue({
        id: 'stored-logo',
        organizationId: 'org-123',
      } as any)
      await service.uploadFile(mockFileUpload as any, 'user-123', {
        organizationId: 'org-123',
        folder: 'logos',
      })
      expect(mockPrisma.storedFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-123',
          }),
        }),
      )
    })
    it('should upload file with custom metadata', async () => {
      const mockFileUpload = {
        filename: 'document.pdf',
        mimetype: 'application/pdf',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('pdf content'))
          stream.push(null)
          return stream
        },
      }
      mockStorageProvider.upload.mockResolvedValue({
        provider: 'local',
        providerFileId: 'doc-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        size: 11,
        url: '/documents/document.pdf',
        metadata: { type: 'document', category: 'legal' },
      })
      mockPrisma.storedFile.create.mockResolvedValue({
        id: 'stored-doc',
        metadata: { type: 'document', category: 'legal' },
      } as any)
      await service.uploadFile(mockFileUpload as any, 'user-123', {
        metadata: { type: 'document', category: 'legal' },
      })
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: { type: 'document', category: 'legal' },
        }),
      )
    })
  })
  describe('uploadUserAvatar', () => {
    it('should upload user avatar to avatars folder', async () => {
      const mockFileUpload = {
        filename: 'avatar.jpg',
        mimetype: 'image/jpeg',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('avatar'))
          stream.push(null)
          return stream
        },
      }
      mockStorageProvider.upload.mockResolvedValue({
        provider: 'local',
        providerFileId: 'avatar-123',
        folder: 'avatars',
        filename: 'avatar.jpg',
        mimeType: 'image/jpeg',
        size: 6,
        url: '/avatars/avatar.jpg',
        metadata: { type: 'avatar' },
      })
      mockPrisma.storedFile.create.mockResolvedValue({
        id: 'stored-avatar',
        folder: 'user_avatars/user-123',
      } as any)
      // No existing avatar
      mockPrisma.user.findUnique.mockResolvedValue({ avatarId: null })
      mockPrisma.user.update.mockResolvedValue({})
      const result = await service.uploadUserAvatar(mockFileUpload as any, 'user-123')
      expect(result.folder).toBe('user_avatars/user-123')
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          folder: 'user_avatars/user-123',
        }),
      )
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { avatarId: 'stored-avatar' },
      })
    })
  })
  describe('uploadOrganizationLogo', () => {
    it('should upload organization logo to logos folder', async () => {
      const mockFileUpload = {
        filename: 'logo.png',
        mimetype: 'image/png',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('logo'))
          stream.push(null)
          return stream
        },
      }
      mockStorageProvider.upload.mockResolvedValue({
        provider: 'local',
        providerFileId: 'logo-123',
        folder: 'logos',
        filename: 'logo.png',
        mimeType: 'image/png',
        size: 4,
        url: '/logos/logo.png',
        metadata: { type: 'logo' },
      })
      mockPrisma.storedFile.create.mockResolvedValue({
        id: 'stored-logo',
        folder: 'org_avatars/org-123',
        organizationId: 'org-123',
      } as any)
      // Mock org membership check (Owner/Admin)
      mockPrisma.organizationMember.findFirst.mockResolvedValue({ role: { name: 'Owner' } })
      // No existing logo
      mockPrisma.organization.findUnique.mockResolvedValue({ logoId: null })
      mockPrisma.organization.update.mockResolvedValue({})
      const result = await service.uploadOrganizationLogo(
        mockFileUpload as any,
        'user-123',
        'org-123',
      )
      expect(result.folder).toBe('org_avatars/org-123')
      expect(result.organizationId).toBe('org-123')
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-123' },
        data: { logoId: 'stored-logo' },
      })
    })
  })
  describe('deleteFile', () => {
    it('should delete file from storage and database', async () => {
      const mockStoredFile = {
        id: 'stored-123',
        providerFileId: 'file-123',
        userId: 'user-123',
        filename: 'test.jpg',
        provider: StorageProvider.LOCAL,
      }
      mockPrisma.storedFile.findUnique.mockResolvedValue(mockStoredFile as any)
      mockStorageFactory.getProviderByName = jest.fn().mockReturnValue(mockStorageProvider)
      mockStorageProvider.delete.mockResolvedValue(undefined)
      mockPrisma.storedFile.delete.mockResolvedValue(mockStoredFile as any)
      await service.deleteFile('stored-123', 'user-123')
      expect(mockPrisma.storedFile.findUnique).toHaveBeenCalledWith({
        where: { id: 'stored-123' },
      })
      expect(mockStorageFactory.getProviderByName).toHaveBeenCalledWith('local')
      expect(mockStorageProvider.delete).toHaveBeenCalledWith('file-123')
      expect(mockPrisma.storedFile.delete).toHaveBeenCalledWith({
        where: { id: 'stored-123' },
      })
    })
    it('should throw NotFoundException when file does not exist', async () => {
      mockPrisma.storedFile.findUnique.mockResolvedValue(null)
      await expect(service.deleteFile('non-existent', 'user-123')).rejects.toThrow(
        NotFoundException,
      )
      await expect(service.deleteFile('non-existent', 'user-123')).rejects.toThrow(
        'Upload not found: non-existent',
      )
    })
    it('should throw NotFoundException when user does not own the file', async () => {
      mockPrisma.storedFile.findUnique.mockResolvedValue({
        id: 'stored-123',
        userId: 'different-user',
      } as any)
      await expect(service.deleteFile('stored-123', 'user-123')).rejects.toThrow(NotFoundException)
      await expect(service.deleteFile('stored-123', 'user-123')).rejects.toThrow(
        'Upload not found: stored-123',
      )
      // Should not call delete if user doesn't own the file
      expect(mockStorageProvider.delete).not.toHaveBeenCalled()
      expect(mockPrisma.storedFile.delete).not.toHaveBeenCalled()
    })
  })
  describe('getUserFiles', () => {
    it('should return user files with default pagination', async () => {
      const mockFiles = [
        { id: 'file-1', userId: 'user-123', filename: 'file1.jpg' },
        { id: 'file-2', userId: 'user-123', filename: 'file2.png' },
      ]
      mockPrisma.storedFile.findMany.mockResolvedValue(mockFiles as any)
      const result = await service.getUserFiles('user-123')
      expect(result).toEqual(mockFiles)
      expect(mockPrisma.storedFile.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        take: 50,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      })
    })
    it('should return user files with custom pagination', async () => {
      mockPrisma.storedFile.findMany.mockResolvedValue([])
      await service.getUserFiles('user-123', 10, 20)
      expect(mockPrisma.storedFile.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        take: 10,
        skip: 20,
        orderBy: { createdAt: 'desc' },
      })
    })
  })
  describe('getOrganizationFiles', () => {
    it('should return organization files with default pagination', async () => {
      const mockFiles = [
        { id: 'file-1', organizationId: 'org-123', filename: 'logo.png' },
        { id: 'file-2', organizationId: 'org-123', filename: 'banner.jpg' },
      ]
      mockPrisma.storedFile.findMany.mockResolvedValue(mockFiles as any)
      const result = await service.getOrganizationFiles('org-123')
      expect(result).toEqual(mockFiles)
      expect(mockPrisma.storedFile.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        take: 50,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      })
    })
    it('should return organization files with custom pagination', async () => {
      mockPrisma.storedFile.findMany.mockResolvedValue([])
      await service.getOrganizationFiles('org-123', 25, 10)
      expect(mockPrisma.storedFile.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        take: 25,
        skip: 10,
        orderBy: { createdAt: 'desc' },
      })
    })
  })
  describe('getSignedUrl', () => {
    it('should return signed URL for a file', async () => {
      const mockStoredFile = {
        id: 'stored-123',
        providerFileId: 'file-123',
        filename: 'private.pdf',
        provider: StorageProvider.LOCAL,
      }
      mockPrisma.storedFile.findUnique.mockResolvedValue(mockStoredFile as any)
      mockStorageFactory.getProviderByName = jest.fn().mockReturnValue(mockStorageProvider)
      mockStorageProvider.getSignedUrl.mockResolvedValue(
        'https://storage.example.com/file-123?signature=abc123&expires=3600',
      )
      const result = await service.getSignedUrl('stored-123')
      expect(result).toBe('https://storage.example.com/file-123?signature=abc123&expires=3600')
      expect(mockStorageFactory.getProviderByName).toHaveBeenCalledWith('local')
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith('file-123', 3600)
    })
    it('should return signed URL with custom expiration', async () => {
      mockPrisma.storedFile.findUnique.mockResolvedValue({
        id: 'stored-123',
        providerFileId: 'file-123',
        provider: StorageProvider.LOCAL,
      } as any)
      mockStorageFactory.getProviderByName = jest.fn().mockReturnValue(mockStorageProvider)
      mockStorageProvider.getSignedUrl.mockResolvedValue('https://signed-url.com')
      await service.getSignedUrl('stored-123', 7200)
      expect(mockStorageFactory.getProviderByName).toHaveBeenCalledWith('local')
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith('file-123', 7200)
    })
    it('should throw NotFoundException when file does not exist', async () => {
      mockPrisma.storedFile.findUnique.mockResolvedValue(null)
      await expect(service.getSignedUrl('non-existent')).rejects.toThrow(NotFoundException)
      await expect(service.getSignedUrl('non-existent')).rejects.toThrow(
        'Upload not found: non-existent',
      )
    })
  })
  describe('Provider mapping', () => {
    it('should map LOCAL provider correctly', async () => {
      const mockFileUpload = {
        filename: 'test.jpg',
        mimetype: 'image/jpeg',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('test'))
          stream.push(null)
          return stream
        },
      }
      mockStorageProvider.upload.mockResolvedValue({
        provider: 'local',
        providerFileId: 'file-123',
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 4,
        url: '/uploads/test.jpg',
      })
      mockPrisma.storedFile.create.mockResolvedValue({
        id: 'stored-123',
        provider: StorageProvider.LOCAL,
      } as any)
      const result = await service.uploadFile(mockFileUpload as any, 'user-123')
      expect(result.provider).toBe(StorageProvider.LOCAL)
    })
    it('should map S3 provider correctly', async () => {
      const mockFileUpload = {
        filename: 'test.jpg',
        mimetype: 'image/jpeg',
        createReadStream: () => {
          const stream = new Readable()
          stream.push(Buffer.from('test'))
          stream.push(null)
          return stream
        },
      }
      mockStorageProvider.upload.mockResolvedValue({
        provider: 's3',
        providerFileId: 'file-456',
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 4,
        url: 'https://s3.amazonaws.com/bucket/test.jpg',
      })
      mockPrisma.storedFile.create.mockResolvedValue({
        id: 'stored-456',
        provider: StorageProvider.S3,
      } as any)
      const result = await service.uploadFile(mockFileUpload as any, 'user-123')
      expect(result.provider).toBe(StorageProvider.S3)
    })
  })
})
