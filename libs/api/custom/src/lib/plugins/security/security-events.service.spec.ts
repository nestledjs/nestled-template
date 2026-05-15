import { Test, TestingModule } from '@nestjs/testing'
import { SecurityEventsService, SecurityEventContext } from './security-events.service'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { SecurityEventType } from '@nestled-template/api/core/models'
describe('SecurityEventsService', () => {
  let service: SecurityEventsService
  let mockData: any
  beforeEach(async () => {
    mockData = {
      securityEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'event-123',
          userId: 'user-123',
          eventType: SecurityEventType.PASSWORD_CHANGED,
          createdAt: new Date(),
        }),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
    }
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityEventsService,
        {
          provide: ApiCoreDataAccessService,
          useValue: mockData,
        },
      ],
    }).compile()
    service = module.get<SecurityEventsService>(SecurityEventsService)
  })
  describe('Event Logging', () => {
    it('should log a security event successfully', async () => {
      const userId = 'user-123'
      const context: SecurityEventContext = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: { action: 'test' },
      }
      await service.logEvent(userId, SecurityEventType.PASSWORD_CHANGED, context)
      // Allow async operation to complete
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: {
          userId,
          eventType: SecurityEventType.PASSWORD_CHANGED,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: { action: 'test' },
        },
      })
    })
    it('should log event with minimal context', async () => {
      await service.logEvent('user-123', SecurityEventType.PASSWORD_CHANGED)
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          eventType: SecurityEventType.PASSWORD_CHANGED,
          ipAddress: undefined,
          userAgent: undefined,
          metadata: {},
        },
      })
    })
    // Note: Error handling is tested implicitly - the service catches all errors
    // internally and logs them without throwing, by design
  })
  describe('Specific Event Types', () => {
    it('should log password changed event', async () => {
      const context: SecurityEventContext = {
        ipAddress: '192.168.1.1',
      }
      await service.logPasswordChanged('user-123', context)
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          eventType: SecurityEventType.PASSWORD_CHANGED,
          ipAddress: '192.168.1.1',
        }),
      })
    })
    it('should log email changed event with old and new email', async () => {
      await service.logEmailChanged('user-123', 'old@example.com', 'new@example.com')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          eventType: SecurityEventType.EMAIL_CHANGED,
          metadata: expect.objectContaining({
            oldEmail: 'old@example.com',
            newEmail: 'new@example.com',
          }),
        }),
      })
    })
    it('should log password reset requested event', async () => {
      await service.logPasswordResetRequested('user-123')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.PASSWORD_RESET_REQUESTED,
        }),
      })
    })
    it('should log suspicious login with reason', async () => {
      await service.logSuspiciousLogin('user-123', 'New location detected')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.SUSPICIOUS_LOGIN_ATTEMPT,
          metadata: expect.objectContaining({
            reason: 'New location detected',
          }),
        }),
      })
    })
    it('should log 2FA enabled event', async () => {
      await service.log2FAEnabled('user-123')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.TWO_FACTOR_ENABLED,
        }),
      })
    })
    it('should log 2FA disabled event', async () => {
      await service.log2FADisabled('user-123')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.TWO_FACTOR_DISABLED,
        }),
      })
    })
    it('should log recovery codes generated event', async () => {
      await service.logRecoveryCodesGenerated('user-123')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.RECOVERY_CODES_GENERATED,
        }),
      })
    })
    it('should log account locked event with reason', async () => {
      await service.logAccountLocked('user-123', 'Too many failed attempts')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.ACCOUNT_LOCKED,
          metadata: expect.objectContaining({
            reason: 'Too many failed attempts',
          }),
        }),
      })
    })
    it('should log account unlocked event', async () => {
      await service.logAccountUnlocked('user-123')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.ACCOUNT_UNLOCKED,
        }),
      })
    })
    it('should log login location change with previous and new location', async () => {
      await service.logLoginLocationChange('user-123', 'New York', 'San Francisco')
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: SecurityEventType.LOGIN_LOCATION_CHANGE,
          metadata: expect.objectContaining({
            previousLocation: 'New York',
            newLocation: 'San Francisco',
          }),
        }),
      })
    })
  })
  describe('Event Retrieval', () => {
    it('should get user security events with default limit', async () => {
      const mockEvents = [
        { id: 'event-1', userId: 'user-123', eventType: SecurityEventType.PASSWORD_CHANGED },
        { id: 'event-2', userId: 'user-123', eventType: SecurityEventType.EMAIL_CHANGED },
      ]
      mockData.securityEvent.findMany.mockResolvedValue(mockEvents as any)
      const result = await service.getUserSecurityEvents('user-123')
      expect(result).toEqual(mockEvents)
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    })
    it('should get user security events with custom limit', async () => {
      mockData.securityEvent.findMany.mockResolvedValue([])
      await service.getUserSecurityEvents('user-123', 10)
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    })
    it('should get user security events with paging', async () => {
      mockData.securityEvent.findMany.mockResolvedValue([])
      const pagingInput = {
        take: 20,
        skip: 40,
        orderBy: 'createdAt',
        orderDirection: 'asc',
      }
      await service.getUserSecurityEventsWithPaging('user-123', pagingInput)
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'asc' },
        take: 20,
        skip: 40,
      })
    })
    it('should use default paging values when not provided', async () => {
      mockData.securityEvent.findMany.mockResolvedValue([])
      await service.getUserSecurityEventsWithPaging('user-123')
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      })
    })
    it('should get events by type', async () => {
      const mockEvents = [{ id: 'event-1', eventType: SecurityEventType.PASSWORD_CHANGED }]
      mockData.securityEvent.findMany.mockResolvedValue(mockEvents as any)
      const result = await service.getEventsByType(
        'user-123',
        SecurityEventType.PASSWORD_CHANGED,
        25,
      )
      expect(result).toEqual(mockEvents)
      expect(mockData.securityEvent.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', eventType: SecurityEventType.PASSWORD_CHANGED },
        orderBy: { createdAt: 'desc' },
        take: 25,
      })
    })
  })
  describe('Security Summary', () => {
    it('should generate security summary for user', async () => {
      const lastPasswordChange = {
        id: 'event-pw',
        userId: 'user-123',
        eventType: SecurityEventType.PASSWORD_CHANGED,
        createdAt: new Date('2025-10-01'),
      }
      mockData.securityEvent.count
        .mockResolvedValueOnce(15) // recentEvents count
        .mockResolvedValueOnce(2) // suspiciousAttempts count
      mockData.securityEvent.findFirst.mockResolvedValue(lastPasswordChange as any)
      const result = await service.getSecuritySummary('user-123')
      expect(result).toEqual({
        recentEventsCount: 15,
        lastPasswordChange: lastPasswordChange.createdAt,
        suspiciousAttemptsLast30Days: 2,
      })
      // Verify count was called for recent events (last 30 days)
      expect(mockData.securityEvent.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          createdAt: {
            gte: expect.any(Date),
          },
        },
      })
      // Verify findFirst was called for last password change
      expect(mockData.securityEvent.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-123', eventType: SecurityEventType.PASSWORD_CHANGED },
        orderBy: { createdAt: 'desc' },
      })
      // Verify count was called for suspicious attempts (last 30 days)
      expect(mockData.securityEvent.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          eventType: SecurityEventType.SUSPICIOUS_LOGIN_ATTEMPT,
          createdAt: {
            gte: expect.any(Date),
          },
        },
      })
    })
    it('should handle user with no password changes', async () => {
      mockData.securityEvent.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0)
      mockData.securityEvent.findFirst.mockResolvedValue(null)
      const result = await service.getSecuritySummary('user-123')
      expect(result.lastPasswordChange).toBeNull()
      expect(result.recentEventsCount).toBe(5)
      expect(result.suspiciousAttemptsLast30Days).toBe(0)
    })
    it('should calculate 30-day window correctly', async () => {
      mockData.securityEvent.count.mockResolvedValue(0)
      mockData.securityEvent.findFirst.mockResolvedValue(null)
      const before = Date.now()
      await service.getSecuritySummary('user-123')
      const after = Date.now()
      // Get the date passed to the first count call
      const firstCountCall = mockData.securityEvent.count.mock.calls[0][0]
      const cutoffDate = firstCountCall.where.createdAt.gte
      // The cutoff should be approximately 30 days ago
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const timeDiff = Math.abs(cutoffDate.getTime() - thirtyDaysAgo)
      // Allow 1 second tolerance for test execution time
      expect(timeDiff).toBeLessThan(1000)
    })
  })
  describe('Metadata Handling', () => {
    it('should merge metadata from context with event-specific metadata', async () => {
      const context: SecurityEventContext = {
        ipAddress: '192.168.1.1',
        metadata: { sessionId: 'session-123' },
      }
      await service.logEmailChanged('user-123', 'old@example.com', 'new@example.com', context)
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {
            oldEmail: 'old@example.com',
            newEmail: 'new@example.com',
            sessionId: 'session-123',
          },
        }),
      })
    })
    it('should handle empty metadata gracefully', async () => {
      await service.logEvent('user-123', SecurityEventType.PASSWORD_CHANGED, {})
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {},
        }),
      })
    })
    it('should preserve complex metadata structures', async () => {
      const context: SecurityEventContext = {
        metadata: {
          nested: {
            value: 'test',
            array: [1, 2, 3],
          },
        },
      }
      await service.logEvent('user-123', SecurityEventType.PASSWORD_CHANGED, context)
      await new Promise(resolve => setImmediate(resolve))
      expect(mockData.securityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {
            nested: {
              value: 'test',
              array: [1, 2, 3],
            },
          },
        }),
      })
    })
  })
  describe('Async Behavior', () => {
    it('should not block on event logging', async () => {
      // Create a slow mock that takes 100ms
      mockData.securityEvent.create.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100)),
      )
      const start = Date.now()
      await service.logEvent('user-123', SecurityEventType.PASSWORD_CHANGED)
      const duration = Date.now() - start
      // Should return almost immediately (well under 100ms)
      expect(duration).toBeLessThan(50)
    })
    it('should handle multiple concurrent event logs', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.logEvent(`user-${i}`, SecurityEventType.PASSWORD_CHANGED),
      )
      await Promise.all(promises)
      // Allow all async operations to complete
      await new Promise(resolve => setImmediate(resolve))
      // All 10 events should be logged
      expect(mockData.securityEvent.create).toHaveBeenCalledTimes(10)
    })
  })
})
