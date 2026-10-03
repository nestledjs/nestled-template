import { Test, TestingModule } from '@nestjs/testing'
import { SessionService, SessionInfo } from './session.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { ConfigService } from '@nestjs/config'
describe('SessionService', () => {
  let service: SessionService
  let mockData: any
  let mockConfigService: jest.Mocked<ConfigService>
  beforeEach(async () => {
    mockData = {
      userSession: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    }
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'session.maxConcurrent') return '5'
        return undefined
      }),
    } as any
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockData,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile()
    service = module.get<SessionService>(SessionService)
  })
  describe('Session Creation', () => {
    it('should create a session successfully', async () => {
      const userId = 'user-123'
      const sessionInfo: SessionInfo = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome',
        deviceInfo: 'Chrome on Windows',
      }
      const mockSession = {
        id: 'session-123',
        userId,
        deviceInfo: 'Chrome on Windows',
        ipAddress: '192.168.1.1',
        isValid: true,
        twoFactorVerified: false,
      }
      mockData.userSession.findMany.mockResolvedValue([]) // No existing sessions
      mockData.userSession.create.mockResolvedValue(mockSession as any)
      const result = await service.createSession(userId, sessionInfo, false)
      expect(result).toBe('session-123')
      expect(mockData.userSession.create).toHaveBeenCalledWith({
        data: {
          userId,
          deviceInfo: 'Chrome on Windows',
          ipAddress: '192.168.1.1',
          twoFactorVerified: false,
          isValid: true,
          lastActiveAt: expect.any(Date),
        },
      })
    })
    it('should create session with 2FA verified flag', async () => {
      const userId = 'user-123'
      const sessionInfo: SessionInfo = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }
      const mockSession = {
        id: 'session-456',
        userId,
        twoFactorVerified: true,
      }
      mockData.userSession.findMany.mockResolvedValue([])
      mockData.userSession.create.mockResolvedValue(mockSession as any)
      await service.createSession(userId, sessionInfo, true)
      expect(mockData.userSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          twoFactorVerified: true,
        }),
      })
    })
    it('should enforce session limit when creating new session', async () => {
      const userId = 'user-123'
      const sessionInfo: SessionInfo = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }
      // Mock 5 existing sessions (at the limit)
      const existingSessions = Array.from({ length: 5 }, (_, i) => ({
        id: `session-${i}`,
        userId,
        isValid: true,
        lastActiveAt: new Date(Date.now() - i * 1000), // Older sessions have earlier timestamps
      }))
      mockData.userSession.findMany.mockResolvedValue(existingSessions as any)
      mockData.userSession.update.mockResolvedValue({} as any) // For invalidation
      mockData.userSession.create.mockResolvedValue({ id: 'new-session' } as any)
      await service.createSession(userId, sessionInfo, false)
      // Should invalidate the oldest session (session-4)
      expect(mockData.userSession.update).toHaveBeenCalledWith({
        where: { id: 'session-4' },
        data: { isValid: false },
      })
    })
  })
  describe('Session Validation', () => {
    it('should validate an existing valid session', async () => {
      mockData.userSession.findUnique.mockResolvedValue({
        id: 'session-123',
        isValid: true,
      } as any)
      const result = await service.validateSession('session-123')
      expect(result).toBe(true)
      expect(mockData.userSession.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-123' },
      })
    })
    it('should return false for invalid session', async () => {
      mockData.userSession.findUnique.mockResolvedValue({
        id: 'session-123',
        isValid: false,
      } as any)
      const result = await service.validateSession('session-123')
      expect(result).toBe(false)
    })
    it('should return false for non-existent session', async () => {
      mockData.userSession.findUnique.mockResolvedValue(null)
      const result = await service.validateSession('non-existent')
      expect(result).toBe(false)
    })
  })
  describe('Session Invalidation', () => {
    it('should invalidate a specific session', async () => {
      mockData.userSession.update.mockResolvedValue({} as any)
      await service.invalidateSession('session-123')
      expect(mockData.userSession.update).toHaveBeenCalledWith({
        where: { id: 'session-123' },
        data: { isValid: false },
      })
    })
    it('should invalidate all user sessions except current', async () => {
      mockData.userSession.updateMany.mockResolvedValue({ count: 3 } as any)
      const count = await service.invalidateAllUserSessions('user-123', 'session-current')
      expect(count).toBe(3)
      expect(mockData.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          id: { not: 'session-current' },
          isValid: true,
        },
        data: { isValid: false },
      })
    })
    it('should invalidate all user sessions when no exception specified', async () => {
      mockData.userSession.updateMany.mockResolvedValue({ count: 5 } as any)
      const count = await service.invalidateAllUserSessions('user-123')
      expect(count).toBe(5)
      expect(mockData.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          id: undefined,
          isValid: true,
        },
        data: { isValid: false },
      })
    })
  })
  describe('Session Activity', () => {
    it('should update session activity timestamp', async () => {
      mockData.userSession.update.mockResolvedValue({} as any)
      await service.updateSessionActivity('session-123')
      expect(mockData.userSession.update).toHaveBeenCalledWith({
        where: { id: 'session-123' },
        data: { lastActiveAt: expect.any(Date) },
      })
    })
    it('should handle update failure gracefully', async () => {
      mockData.userSession.update.mockRejectedValue(new Error('Session not found'))
      // Should not throw
      await expect(service.updateSessionActivity('invalid-session')).resolves.toBeUndefined()
    })
  })
  describe('Get Active Sessions', () => {
    it('should get all active sessions for a user', async () => {
      const mockSessions = [
        { id: 'session-1', userId: 'user-123', isValid: true, lastActiveAt: new Date() },
        { id: 'session-2', userId: 'user-123', isValid: true, lastActiveAt: new Date() },
      ]
      mockData.userSession.findMany.mockResolvedValue(mockSessions as any)
      const result = await service.getUserActiveSessions('user-123')
      expect(result).toEqual(mockSessions)
      expect(mockData.userSession.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          isValid: true,
        },
        orderBy: {
          lastActiveAt: 'desc',
        },
      })
    })
  })
  describe('Session Cleanup', () => {
    it('should cleanup old invalid sessions', async () => {
      mockData.userSession.deleteMany.mockResolvedValue({ count: 10 } as any)
      const count = await service.cleanupOldSessions(30)
      expect(count).toBe(10)
      expect(mockData.userSession.deleteMany).toHaveBeenCalledWith({
        where: {
          isValid: false,
          updatedAt: {
            lt: expect.any(Date),
          },
        },
      })
    })
    it('should use custom days old parameter', async () => {
      mockData.userSession.deleteMany.mockResolvedValue({ count: 5 } as any)
      const count = await service.cleanupOldSessions(60)
      expect(count).toBe(5)
    })
  })
  describe('New Location/Device Detection', () => {
    it('should return false when no recent sessions exist', async () => {
      mockData.userSession.findMany.mockResolvedValue([])
      const sessionInfo: SessionInfo = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }
      const result = await service.detectNewLocationOrDevice('user-123', sessionInfo)
      expect(result).toBe(false)
    })
    it('should return false when IP matches recent session', async () => {
      mockData.userSession.findMany.mockResolvedValue([
        { ipAddress: '192.168.1.1', deviceInfo: 'Old Device' },
      ] as any)
      const sessionInfo: SessionInfo = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }
      const result = await service.detectNewLocationOrDevice('user-123', sessionInfo)
      expect(result).toBe(false)
    })
    it('should return false when device info matches recent session', async () => {
      mockData.userSession.findMany.mockResolvedValue([
        { ipAddress: '1.2.3.4', deviceInfo: 'Chrome on Windows' },
      ] as any)
      const sessionInfo: SessionInfo = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        deviceInfo: 'Chrome on Windows',
      }
      const result = await service.detectNewLocationOrDevice('user-123', sessionInfo)
      expect(result).toBe(false)
    })
    it('should return true when both IP and device are new', async () => {
      mockData.userSession.findMany.mockResolvedValue([
        { ipAddress: '1.2.3.4', deviceInfo: 'Chrome on Windows' },
      ] as any)
      const sessionInfo: SessionInfo = {
        ipAddress: '192.168.1.1',
        userAgent: 'Safari/537.36',
        deviceInfo: 'Safari on macOS',
      }
      const result = await service.detectNewLocationOrDevice('user-123', sessionInfo)
      expect(result).toBe(true)
    })
  })
  describe('Session Info Extraction', () => {
    it('should extract session info from request', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.ipAddress).toBe('192.168.1.1')
      expect(result.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0')
      expect(result.deviceInfo).toContain('Windows')
      expect(result.deviceInfo).toContain('Chrome')
    })
    it('should parse Chrome user agent correctly', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.deviceInfo).toBe('Chrome on Windows')
    })
    it('should parse Safari user agent correctly', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.deviceInfo).toBe('Safari on macOS')
    })
    it('should parse Firefox user agent correctly', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Firefox/89.0',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.deviceInfo).toBe('Firefox on Windows')
    })
    it('should parse mobile iOS user agent correctly', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) Safari/604.1',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.deviceInfo).toBe('Safari on iOS')
    })
    it('should parse Android user agent correctly', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Linux; Android 11) Chrome/91.0',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.deviceInfo).toBe('Chrome on Android')
    })
    it('should handle missing user agent', () => {
      const mockReq = {
        headers: {},
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.userAgent).toBeUndefined()
      expect(result.deviceInfo).toBe('Unknown Device')
    })
    it('should extract IP from x-forwarded-for header', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.ipAddress).toBe('192.168.1.1')
    })
    it('should extract IP from x-real-ip header', () => {
      const mockReq = {
        headers: {
          'x-real-ip': '192.168.1.1',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.ipAddress).toBe('192.168.1.1')
    })
    it('should extract IP from connection', () => {
      const mockReq = {
        headers: {},
        connection: {
          remoteAddress: '192.168.1.1',
        },
      }
      const result = service.extractSessionInfo(mockReq)
      expect(result.ipAddress).toBe('192.168.1.1')
    })
  })
})
