import { Injectable, Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { SecurityEventType } from '@nestled-template/api/core/models'

export interface SecurityEventContext {
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
}

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name)

  constructor(private readonly data: ApiCoreDataAccessService) {}

  /**
   * Log a security event asynchronously (non-blocking)
   */
  async logEvent(
    userId: string,
    eventType: SecurityEventType,
    context?: SecurityEventContext,
  ): Promise<void> {
    try {
      // Use setImmediate to make this async and non-blocking
      setImmediate(async () => {
        await this.data.securityEvent.create({
          data: {
            userId,
            eventType,
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
            metadata: context?.metadata || {},
          },
        })
      })

      this.logger.log(`Security event logged: ${eventType} for user ${userId}`)
    } catch (error) {
      // Log error but don't throw - security logging should not break app flow
      this.logger.error(`Failed to log security event: ${eventType}`, error)
    }
  }

  /**
   * Log password change event
   */
  async logPasswordChanged(userId: string, context?: SecurityEventContext): Promise<void> {
    return this.logEvent(userId, SecurityEventType.PASSWORD_CHANGED, context)
  }

  /**
   * Log email change event
   */
  async logEmailChanged(
    userId: string,
    oldEmail: string,
    newEmail: string,
    context?: SecurityEventContext,
  ): Promise<void> {
    return this.logEvent(userId, SecurityEventType.EMAIL_CHANGED, {
      ...context,
      metadata: { oldEmail, newEmail, ...context?.metadata },
    })
  }

  /**
   * Log password reset request
   */
  async logPasswordResetRequested(userId: string, context?: SecurityEventContext): Promise<void> {
    return this.logEvent(userId, SecurityEventType.PASSWORD_RESET_REQUESTED, context)
  }

  /**
   * Log suspicious login attempt
   */
  async logSuspiciousLogin(
    userId: string,
    reason: string,
    context?: SecurityEventContext,
  ): Promise<void> {
    return this.logEvent(userId, SecurityEventType.SUSPICIOUS_LOGIN_ATTEMPT, {
      ...context,
      metadata: { reason, ...context?.metadata },
    })
  }

  /**
   * Log 2FA enabled
   */
  async log2FAEnabled(userId: string, context?: SecurityEventContext): Promise<void> {
    return this.logEvent(userId, SecurityEventType.TWO_FACTOR_ENABLED, context)
  }

  /**
   * Log 2FA disabled
   */
  async log2FADisabled(userId: string, context?: SecurityEventContext): Promise<void> {
    return this.logEvent(userId, SecurityEventType.TWO_FACTOR_DISABLED, context)
  }

  /**
   * Log recovery codes generated
   */
  async logRecoveryCodesGenerated(userId: string, context?: SecurityEventContext): Promise<void> {
    return this.logEvent(userId, SecurityEventType.RECOVERY_CODES_GENERATED, context)
  }

  /**
   * Log account locked
   */
  async logAccountLocked(
    userId: string,
    reason: string,
    context?: SecurityEventContext,
  ): Promise<void> {
    return this.logEvent(userId, SecurityEventType.ACCOUNT_LOCKED, {
      ...context,
      metadata: { reason, ...context?.metadata },
    })
  }

  /**
   * Log account unlocked
   */
  async logAccountUnlocked(userId: string, context?: SecurityEventContext): Promise<void> {
    return this.logEvent(userId, SecurityEventType.ACCOUNT_UNLOCKED, context)
  }

  /**
   * Log login from new location
   */
  async logLoginLocationChange(
    userId: string,
    previousLocation: string,
    newLocation: string,
    context?: SecurityEventContext,
  ): Promise<void> {
    return this.logEvent(userId, SecurityEventType.LOGIN_LOCATION_CHANGE, {
      ...context,
      metadata: { previousLocation, newLocation, ...context?.metadata },
    })
  }

  /**
   * Get user's recent security events
   */
  async getUserSecurityEvents(userId: string, limit = 50) {
    return this.data.securityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  /**
   * Get user's security events with CorePaging support
   */
  async getUserSecurityEventsWithPaging(userId: string, input?: any) {
    const { take = 50, skip = 0, orderBy = 'createdAt', orderDirection = 'desc' } = input || {}

    return this.data.securityEvent.findMany({
      where: { userId },
      orderBy: { [orderBy]: orderDirection },
      take,
      skip,
    })
  }

  /**
   * Get security events by type
   */
  async getEventsByType(userId: string, eventType: SecurityEventType, limit = 50) {
    return this.data.securityEvent.findMany({
      where: { userId, eventType },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  /**
   * Get security summary for user
   */
  async getSecuritySummary(userId: string) {
    const recentEvents = await this.data.securityEvent.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    })

    const lastPasswordChange = await this.data.securityEvent.findFirst({
      where: { userId, eventType: SecurityEventType.PASSWORD_CHANGED },
      orderBy: { createdAt: 'desc' },
    })

    const suspiciousAttempts = await this.data.securityEvent.count({
      where: {
        userId,
        eventType: SecurityEventType.SUSPICIOUS_LOGIN_ATTEMPT,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    })

    return {
      recentEventsCount: recentEvents,
      lastPasswordChange: lastPasswordChange?.createdAt || null,
      suspiciousAttemptsLast30Days: suspiciousAttempts,
    }
  }
}
