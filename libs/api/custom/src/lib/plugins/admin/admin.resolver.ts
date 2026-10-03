import { Args, Field, InputType, Int, ObjectType, Query, Resolver, Mutation } from '@nestjs/graphql'
import { CtxUser, RequirePlatformPermission } from '@nestled-template/api/utils'
import {
  SecurityEvent,
  AuditLog,
  User,
  Organization,
  SecurityEventType,
} from '@nestled-template/api/core/models'
import { AdminService } from './admin.service'
import { AdminUserFiltersInput, AdminUsersResponse } from './dto'

@InputType()
export class AdminSecurityEventFiltersInput {
  @Field({ nullable: true })
  userId?: string

  @Field(() => SecurityEventType, { nullable: true })
  eventType?: SecurityEventType

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  startDate?: Date

  @Field({ nullable: true })
  endDate?: Date

  @Field(() => Int, { nullable: true })
  skip?: number

  @Field(() => Int, { nullable: true })
  take?: number
}

@ObjectType()
export class AdminSecurityEventsResponse {
  @Field(() => [SecurityEvent])
  events!: SecurityEvent[]

  @Field(() => Int)
  total!: number

  @Field(() => Int)
  skip!: number

  @Field(() => Int)
  take!: number
}

@InputType()
export class AdminAuditLogFiltersInput {
  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  action?: string

  @Field({ nullable: true })
  entityType?: string

  @Field({ nullable: true })
  startDate?: Date

  @Field({ nullable: true })
  endDate?: Date

  @Field(() => Int, { nullable: true })
  skip?: number

  @Field(() => Int, { nullable: true })
  take?: number
}

@ObjectType()
export class AdminAuditLogsResponse {
  @Field(() => [AuditLog])
  logs!: AuditLog[]

  @Field(() => Int)
  total!: number

  @Field(() => Int)
  skip!: number

  @Field(() => Int)
  take!: number
}

@ObjectType()
export class AdminAuditLogFacets {
  // Distinct action values across all audit logs, for filter dropdowns.
  @Field(() => [String])
  actions!: string[]

  // Distinct entityType values across all audit logs, for filter dropdowns.
  @Field(() => [String])
  entityTypes!: string[]
}

@ObjectType()
export class AdminDashboardStats {
  @Field(() => Int)
  totalUsers!: number

  @Field(() => Int)
  totalOrganizations!: number

  @Field(() => Int)
  activeSessions!: number

  @Field(() => Int)
  recentSecurityEvents!: number

  @Field(() => Int)
  activeSubscriptions!: number
}

@ObjectType()
export class AdminAnalyticsEndpoint {
  @Field()
  name!: string

  @Field(() => Int)
  requests!: number

  @Field()
  avgResponseTime!: number

  @Field()
  errorRate!: number
}

@ObjectType()
export class AdminAnalyticsFeature {
  @Field()
  featureName!: string

  @Field(() => Int)
  uniqueUsers!: number

  @Field(() => Int)
  totalUses!: number

  @Field()
  adoptionRate!: number
}

@ObjectType()
export class AdminAnalytics {
  // User Activity Metrics
  @Field(() => Int)
  dailyActiveUsers!: number

  @Field()
  dauChange!: number

  @Field(() => Int)
  monthlyActiveUsers!: number

  @Field()
  mauChange!: number

  @Field(() => Int)
  newUsersToday!: number

  @Field()
  avgSessionDuration!: number

  // System Performance Metrics
  @Field()
  avgApiResponseTime!: number

  @Field(() => Int)
  totalGraphQLOperations!: number

  @Field()
  errorRate!: number

  @Field()
  systemUptime!: number

  // Top Endpoints
  @Field(() => [AdminAnalyticsEndpoint])
  topEndpoints!: AdminAnalyticsEndpoint[]

  // Feature Usage
  @Field(() => [AdminAnalyticsFeature])
  featureUsage!: AdminAnalyticsFeature[]
}

@InputType()
export class AdminOrganizationFiltersInput {
  @Field({ nullable: true })
  search?: string

  @Field(() => Int, { nullable: true })
  skip?: number

  @Field(() => Int, { nullable: true })
  take?: number
}

@ObjectType()
export class AdminOrganizationsResponse {
  @Field(() => [Organization])
  organizations!: Organization[]

  @Field(() => Int)
  total!: number

  @Field(() => Int)
  skip!: number

  @Field(() => Int)
  take!: number
}

@Resolver(() => User)
export class AdminResolver {
  constructor(private readonly service: AdminService) {}

  /**
   * Get paginated and filtered list of users
   * Requires platform.users.read.
   */
  @Query(() => AdminUsersResponse)
  @RequirePlatformPermission('platform.users.read')
  async adminUsers(
    @Args('filters', { type: () => AdminUserFiltersInput, nullable: true })
    filters?: AdminUserFiltersInput,
  ): Promise<AdminUsersResponse> {
    return this.service.getUsers(filters || {})
  }

  /**
   * Get detailed information about a specific user
   * Requires platform.users.read.
   */
  @Query(() => User)
  @RequirePlatformPermission('platform.users.read')
  async adminUserDetails(@Args('userId', { type: () => String }) userId: string): Promise<any> {
    return this.service.getUserDetails(userId)
  }

  /**
   * Get paginated and filtered list of organizations
   * Requires platform.organizations.read.
   */
  @Query(() => AdminOrganizationsResponse)
  @RequirePlatformPermission('platform.organizations.read')
  async adminOrganizations(
    @Args('filters', { type: () => AdminOrganizationFiltersInput, nullable: true })
    filters?: AdminOrganizationFiltersInput,
  ): Promise<AdminOrganizationsResponse> {
    return this.service.getOrganizations(filters || {})
  }

  /**
   * Get security events for admin monitoring (platform-wide)
   * Requires platform.security.read.
   */
  @Query(() => AdminSecurityEventsResponse)
  @RequirePlatformPermission('platform.security.read')
  async adminSecurityEvents(
    @Args('filters', { type: () => AdminSecurityEventFiltersInput, nullable: true })
    filters?: AdminSecurityEventFiltersInput,
  ): Promise<AdminSecurityEventsResponse> {
    return this.service.getSecurityEvents(filters || {})
  }

  /**
   * Get audit logs for admin monitoring (platform-wide)
   * Requires platform.audit.read.
   */
  @Query(() => AdminAuditLogsResponse)
  @RequirePlatformPermission('platform.audit.read')
  async adminAuditLogs(
    @Args('filters', { type: () => AdminAuditLogFiltersInput, nullable: true })
    filters?: AdminAuditLogFiltersInput,
  ): Promise<AdminAuditLogsResponse> {
    return this.service.getAuditLogs(filters || {})
  }

  /**
   * Distinct action/entityType values for the audit-log filter dropdowns.
   * Kept separate from the paged adminAuditLogs query so the UI can fetch it
   * once (cache-first) instead of recomputing the DISTINCT scans on every page
   * or filter change. Requires platform.audit.read.
   */
  @Query(() => AdminAuditLogFacets)
  @RequirePlatformPermission('platform.audit.read')
  async adminAuditLogFacets(): Promise<AdminAuditLogFacets> {
    return this.service.getAuditLogFacets()
  }

  /**
   * Get dashboard statistics
   * Requires platform.analytics.read.
   */
  @Query(() => AdminDashboardStats)
  @RequirePlatformPermission('platform.analytics.read')
  async adminDashboardStats(): Promise<AdminDashboardStats> {
    return this.service.getDashboardStats()
  }

  /**
   * Get comprehensive analytics data
   * Requires platform.analytics.read.
   */
  @Query(() => AdminAnalytics)
  @RequirePlatformPermission('platform.analytics.read')
  async adminAnalytics(): Promise<AdminAnalytics> {
    return this.service.getAnalytics()
  }

  /**
   * Deactivate a user account
   * Requires platform.users.manage and the principal ceiling.
   */
  @Mutation(() => User)
  @RequirePlatformPermission('platform.users.manage')
  async adminDeactivateUser(
    @CtxUser() actor: User,
    @Args('userId', { type: () => String }) userId: string,
  ): Promise<User> {
    return this.service.deactivateUser(actor.id, userId)
  }

  /**
   * Activate a user account
   * Requires platform.users.manage and the principal ceiling.
   */
  @Mutation(() => User)
  @RequirePlatformPermission('platform.users.manage')
  async adminActivateUser(
    @CtxUser() actor: User,
    @Args('userId', { type: () => String }) userId: string,
  ): Promise<User> {
    return this.service.activateUser(actor.id, userId)
  }

  /**
   * Manually verify a user's email
   * Requires platform.users.manage and the principal ceiling.
   */
  @Mutation(() => User)
  @RequirePlatformPermission('platform.users.manage')
  async adminVerifyEmail(
    @CtxUser() actor: User,
    @Args('userId', { type: () => String }) userId: string,
    @Args('emailId', { type: () => String }) emailId: string,
  ): Promise<User> {
    return this.service.verifyEmail(actor.id, userId, emailId)
  }

  /**
   * Force a password reset for a user
   * Requires platform.users.manage and the principal ceiling.
   */
  @Mutation(() => User)
  @RequirePlatformPermission('platform.users.manage')
  async adminForcePasswordReset(
    @CtxUser() actor: User,
    @Args('userId', { type: () => String }) userId: string,
  ): Promise<User> {
    return this.service.forcePasswordReset(actor.id, userId)
  }
}
