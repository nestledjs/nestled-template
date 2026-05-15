import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { ConfigService } from '@nestjs/config'

export interface SessionInfo {
  deviceInfo?: string
  ipAddress?: string
  userAgent?: string
}

@Injectable()
export class SessionService {
  private readonly maxConcurrentSessions: number

  constructor(
    private readonly data: ApiCoreDataAccessService,
    private readonly config: ConfigService,
  ) {
    // Default to 5 concurrent sessions, configurable via env
    this.maxConcurrentSessions = parseInt(
      this.config.get('session.maxConcurrent') ?? '5',
      10
    )
  }

  /**
   * Create a new session in the database
   * Returns session ID to be included in JWT
   */
  async createSession(
    userId: string,
    sessionInfo: SessionInfo,
    twoFactorVerified: boolean = false
  ): Promise<string> {
    // Check concurrent session limit
    await this.enforceSessionLimit(userId)

    const session = await this.data.userSession.create({
      data: {
        userId,
        deviceInfo: sessionInfo.deviceInfo || sessionInfo.userAgent,
        ipAddress: sessionInfo.ipAddress,
        twoFactorVerified,
        isValid: true,
        lastActiveAt: new Date(),
      },
    })

    Logger.log(`Session created for user ${userId}: ${session.id}`)
    return session.id
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.data.userSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() },
      })
    } catch (error) {
      // Session might not exist or be invalid, log but don't throw
      Logger.warn(`Failed to update session activity: ${sessionId}`)
    }
  }

  /**
   * Validate that a session exists and is valid
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const session = await this.data.userSession.findUnique({
      where: { id: sessionId },
    })

    return session !== null && session.isValid
  }

  /**
   * Invalidate a specific session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.data.userSession.update({
      where: { id: sessionId },
      data: { isValid: false },
    })
    Logger.log(`Session invalidated: ${sessionId}`)
  }

  /**
   * Invalidate all sessions for a user except the current one
   */
  async invalidateAllUserSessions(
    userId: string,
    exceptSessionId?: string
  ): Promise<number> {
    const result = await this.data.userSession.updateMany({
      where: {
        userId,
        id: exceptSessionId ? { not: exceptSessionId } : undefined,
        isValid: true,
      },
      data: { isValid: false },
    })

    Logger.log(
      `Invalidated ${result.count} sessions for user ${userId}` +
      (exceptSessionId ? ` (except ${exceptSessionId})` : '')
    )

    return result.count
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId: string) {
    return this.data.userSession.findMany({
      where: {
        userId,
        isValid: true,
      },
      orderBy: {
        lastActiveAt: 'desc',
      },
    })
  }

  /**
   * Enforce concurrent session limit
   * If user has too many active sessions, invalidate the oldest ones
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    const activeSessions = await this.getUserActiveSessions(userId)

    if (activeSessions.length >= this.maxConcurrentSessions) {
      // Sort by lastActiveAt and invalidate oldest sessions
      const sessionsToInvalidate = activeSessions
        .sort((a, b) => a.lastActiveAt.getTime() - b.lastActiveAt.getTime())
        .slice(0, activeSessions.length - this.maxConcurrentSessions + 1)

      for (const session of sessionsToInvalidate) {
        await this.invalidateSession(session.id)
      }

      Logger.log(
        `Enforced session limit for user ${userId}: ` +
        `invalidated ${sessionsToInvalidate.length} oldest sessions`
      )
    }
  }

  /**
   * Clean up old invalid sessions (can be run as cron job)
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    const result = await this.data.userSession.deleteMany({
      where: {
        isValid: false,
        updatedAt: {
          lt: cutoffDate,
        },
      },
    })

    Logger.log(`Cleaned up ${result.count} old sessions`)
    return result.count
  }

  /**
   * Detect if login is from a new location/device
   * Returns true if this appears to be a new device/location
   */
  async detectNewLocationOrDevice(
    userId: string,
    sessionInfo: SessionInfo
  ): Promise<boolean> {
    const recentSessions = await this.data.userSession.findMany({
      where: {
        userId,
        isValid: true,
        lastActiveAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      select: {
        ipAddress: true,
        deviceInfo: true,
      },
    })

    // If no recent sessions, it's not necessarily "new" (first login)
    if (recentSessions.length === 0) {
      return false
    }

    // Check if IP or device info matches any recent session
    const hasMatchingSession = recentSessions.some(
      (session) =>
        session.ipAddress === sessionInfo.ipAddress ||
        session.deviceInfo === sessionInfo.deviceInfo ||
        session.deviceInfo === sessionInfo.userAgent
    )

    return !hasMatchingSession
  }

  /**
   * Extract session info from request
   */
  extractSessionInfo(req: any): SessionInfo {
    return {
      ipAddress: this.extractIpAddress(req),
      userAgent: req.headers?.['user-agent'],
      deviceInfo: this.parseUserAgent(req.headers?.['user-agent']),
    }
  }

  /**
   * Extract IP address from request (handles proxies)
   */
  private extractIpAddress(req: any): string | undefined {
    return (
      req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers?.['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip
    )
  }

  /**
   * Parse user agent into readable device info
   * (Basic implementation - can be enhanced with a library like ua-parser-js)
   */
  private parseUserAgent(userAgent?: string): string {
    if (!userAgent) return 'Unknown Device'

    const ua = userAgent.toLowerCase()

    // Detect OS - order matters! Check more specific patterns first
    let os = 'Unknown OS'
    if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS'
    else if (ua.includes('mac') || ua.includes('macintosh')) os = 'macOS'
    else if (ua.includes('android')) os = 'Android'
    else if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64'))
      os = 'Windows'
    else if (ua.includes('linux')) os = 'Linux'

    // Detect Browser - order matters! Check more specific patterns first
    let browser = 'Unknown Browser'
    if (ua.includes('edg/')) browser = 'Edge'
    else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera'
    else if (ua.includes('chrome')) browser = 'Chrome'
    else if (ua.includes('firefox')) browser = 'Firefox'
    else if (ua.includes('safari')) browser = 'Safari'

    return `${browser} on ${os}`
  }
}
