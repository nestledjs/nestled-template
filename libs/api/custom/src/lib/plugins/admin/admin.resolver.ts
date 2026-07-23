import { Args, Field, InputType, Int, ObjectType, Query, Resolver, Mutation } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { GqlAuthAdminGuard } from '@nestled-template/api/utils'
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
   * Super admin only
   */
  @Query(() => AdminUsersResponse)
  @UseGuards(GqlAuthAdminGuard)
  async adminUsers(
    @Args('filters', { type: () => AdminUserFiltersInput, nullable: true })
    filters?: AdminUserFiltersInput,
  ): Promise<AdminUsersResponse> {
    return this.service.getUsers(filters || {})
  }

  /**
   * Get detailed information about a specific user
   * Super admin only
   */
  @Query(() => User)
  @UseGuards(GqlAuthAdminGuard)
  async adminUserDetails(@Args('userId', { type: () => String }) userId: string): Promise<any> {
    return this.service.getUserDetails(userId)
  }

  /**
   * Get paginated and filtered list of organizations
   * Super admin only
   */
  @Query(() => AdminOrganizationsResponse)
  @UseGuards(GqlAuthAdminGuard)
  async adminOrganizations(
    @Args('filters', { type: () => AdminOrganizationFiltersInput, nullable: true })
    filters?: AdminOrganizationFiltersInput,
  ): Promise<AdminOrganizationsResponse> {
    return this.service.getOrganizations(filters || {})
  }

  /**
   * Get security events for admin monitoring (platform-wide)
   * Super admin only
   */
  @Query(() => AdminSecurityEventsResponse)
  @UseGuards(GqlAuthAdminGuard)
  async adminSecurityEvents(
    @Args('filters', { type: () => AdminSecurityEventFiltersInput, nullable: true })
    filters?: AdminSecurityEventFiltersInput,
  ): Promise<AdminSecurityEventsResponse> {
    return this.service.getSecurityEvents(filters || {})
  }

  /**
   * Get audit logs for admin monitoring (platform-wide)
   * Super admin only
   */
  @Query(() => AdminAuditLogsResponse)
  @UseGuards(GqlAuthAdminGuard)
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
   * or filter change. Super admin only.
   */
  @Query(() => AdminAuditLogFacets)
  @UseGuards(GqlAuthAdminGuard)
  async adminAuditLogFacets(): Promise<AdminAuditLogFacets> {
    return this.service.getAuditLogFacets()
  }

  /**
   * Get dashboard statistics
   * Super admin only
   */
  @Query(() => AdminDashboardStats)
  @UseGuards(GqlAuthAdminGuard)
  async adminDashboardStats(): Promise<AdminDashboardStats> {
    return this.service.getDashboardStats()
  }

  /**
   * Get comprehensive analytics data
   * Super admin only
   */
  @Query(() => AdminAnalytics)
  @UseGuards(GqlAuthAdminGuard)
  async adminAnalytics(): Promise<AdminAnalytics> {
    return this.service.getAnalytics()
  }

  /**
   * Deactivate a user account
   * Super admin only
   */
  @Mutation(() => User)
  @UseGuards(GqlAuthAdminGuard)
  async adminDeactivateUser(@Args('userId', { type: () => String }) userId: string): Promise<User> {
    return this.service.deactivateUser(userId)
  }

  /**
   * Activate a user account
   * Super admin only
   */
  @Mutation(() => User)
  @UseGuards(GqlAuthAdminGuard)
  async adminActivateUser(@Args('userId', { type: () => String }) userId: string): Promise<User> {
    return this.service.activateUser(userId)
  }

  /**
   * Manually verify a user's email
   * Super admin only
   */
  @Mutation(() => User)
  @UseGuards(GqlAuthAdminGuard)
  async adminVerifyEmail(
    @Args('userId', { type: () => String }) userId: string,
    @Args('emailId', { type: () => String }) emailId: string,
  ): Promise<User> {
    return this.service.verifyEmail(userId, emailId)
  }

  /**
   * Force a password reset for a user
   * Super admin only
   */
  @Mutation(() => User)
  @UseGuards(GqlAuthAdminGuard)
  async adminForcePasswordReset(
    @Args('userId', { type: () => String }) userId: string,
  ): Promise<User> {
    return this.service.forcePasswordReset(userId)
  }
}
