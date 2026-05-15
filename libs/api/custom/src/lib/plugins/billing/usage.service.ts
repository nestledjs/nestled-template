import { Injectable, Logger } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'

/**
 * Usage Limits Configuration
 * Define limits for each plan tier
 */
export interface PlanLimits {
  members?: number
  teams?: number
  storage?: number // in MB
  apiCalls?: number // per month
  [key: string]: number | undefined
}

/**
 * Current Usage Data
 */
export interface UsageData {
  members: number
  teams: number
  storage: number
  apiCalls: number
  [key: string]: number
}

/**
 * Usage Service
 *
 * Tracks usage metrics per organization and enforces plan limits.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name)

  constructor(private readonly prisma: ApiCoreDataAccessService) {}

  /**
   * Get current usage for an organization
   */
  async getCurrentUsage(organizationId: string): Promise<UsageData> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            members: true,
            Team: true,
            images: true,
          },
        },
        images: {
          select: {
            size: true,
          },
        },
      },
    })

    if (!organization) {
      throw new Error(`Organization ${organizationId} not found`)
    }

    // Calculate storage usage in MB
    const storageBytes = organization.images.reduce((sum, img) => sum + (img.size || 0), 0)
    const storageMB = Math.ceil(storageBytes / (1024 * 1024))

    return {
      members: organization._count.members,
      teams: organization._count.Team,
      storage: storageMB,
      apiCalls: 0, // TODO: Implement API call tracking if needed
    }
  }

  /**
   * Get plan limits for an organization
   */
  async getPlanLimits(organizationId: string): Promise<PlanLimits | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: {
        plan: true,
      },
    })

    if (!subscription || !subscription.plan) {
      return null
    }

    // Parse limits from plan.limits JSON field
    const limits = subscription.plan.limits as PlanLimits | null
    return limits || {}
  }

  /**
   * Check if organization has exceeded a specific limit
   */
  async hasExceededLimit(
    organizationId: string,
    metric: keyof UsageData,
  ): Promise<boolean> {
    const usage = await this.getCurrentUsage(organizationId)
    const limits = await this.getPlanLimits(organizationId)

    if (!limits || limits[metric] === undefined) {
      // No limit defined for this metric
      return false
    }

    return usage[metric] >= (limits[metric] || 0)
  }

  /**
   * Check if adding N units would exceed the limit
   */
  async wouldExceedLimit(
    organizationId: string,
    metric: keyof UsageData,
    additionalUnits: number = 1,
  ): Promise<boolean> {
    const usage = await this.getCurrentUsage(organizationId)
    const limits = await this.getPlanLimits(organizationId)

    if (!limits || limits[metric] === undefined) {
      // No limit defined for this metric
      return false
    }

    return usage[metric] + additionalUnits > (limits[metric] || 0)
  }

  /**
   * Get usage percentage for a metric (0-100)
   */
  async getUsagePercentage(
    organizationId: string,
    metric: keyof UsageData,
  ): Promise<number> {
    const usage = await this.getCurrentUsage(organizationId)
    const limits = await this.getPlanLimits(organizationId)

    if (!limits || limits[metric] === undefined || limits[metric] === 0) {
      return 0
    }

    const percentage = (usage[metric] / (limits[metric] || 1)) * 100
    return Math.min(Math.round(percentage), 100)
  }

  /**
   * Get all usage data with limits and percentages
   */
  async getUsageWithLimits(organizationId: string) {
    const usage = await this.getCurrentUsage(organizationId)
    const limits = await this.getPlanLimits(organizationId)

    const metrics = Object.keys(usage) as Array<keyof UsageData>

    return {
      usage,
      limits: limits || {},
      percentages: Object.fromEntries(
        metrics.map(metric => [
          metric,
          this.calculatePercentage(usage[metric], limits?.[metric]),
        ]),
      ),
      exceeded: Object.fromEntries(
        metrics.map(metric => [
          metric,
          this.isExceeded(usage[metric], limits?.[metric]),
        ]),
      ),
    }
  }

  private calculatePercentage(current: number, limit: number | undefined): number {
    if (!limit || limit === 0) return 0
    const percentage = (current / limit) * 100
    return Math.min(Math.round(percentage), 100)
  }

  private isExceeded(current: number, limit: number | undefined): boolean {
    if (!limit) return false
    return current >= limit
  }

  /**
   * Log usage metrics (for analytics/auditing)
   */
  async logUsage(organizationId: string, metric: string, value: number): Promise<void> {
    // TODO: Implement usage logging to a separate table for analytics
    // This could be used for detailed usage reports, billing, etc.
    this.logger.log(`Usage - Org: ${organizationId}, Metric: ${metric}, Value: ${value}`)
  }
}
