import { Field, ObjectType, Int, GraphQLISODateTime } from '@nestjs/graphql'
import { GraphQLJSON } from 'graphql-type-json'
import Decimal from 'decimal.js'
import { GraphQLDecimal } from 'prisma-graphql-type-decimal'
import type { JsonValue } from '@nestled-template/api/prisma'
import {
  AddressType,
  EmailType,
  FailureReason,
  ImageType,
  InviteStatus,
  PhoneType,
  SecurityEventType,
  StorageProvider,
  SubscriptionStatus,
  TwoFactorMethod,
} from './enums'

@ObjectType({ description: undefined })
export class Address {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String, { nullable: true })
  address1?: string | null

  @Field(() => String, { nullable: true })
  address2?: string | null

  @Field(() => String, { nullable: true })
  city?: string | null

  @Field(() => String, { nullable: true })
  region?: string | null

  @Field(() => String, { nullable: true })
  postalCode?: string | null

  @Field(() => AddressType)
  addressType!: AddressType

  @Field(() => Boolean)
  isPrimary!: boolean

  @Field(() => String, { nullable: true })
  countryId?: string | null

  @Field(() => Country, { nullable: true })
  country?: Partial<Country> | null

  @Field(() => String, { nullable: true })
  userId?: string | null

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null
}

@ObjectType({ description: undefined })
export class ApiToken {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String)
  tokenHash!: string

  @Field(() => String)
  name!: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastUsedAt?: Date | null

  @Field(() => Boolean)
  revoked!: boolean

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null
}

@ObjectType({ description: undefined })
export class AuditLog {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  entityId!: string

  @Field(() => String)
  entityType!: string

  @Field(() => String)
  action!: string

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null

  @Field(() => GraphQLJSON, { nullable: true })
  changes?: JsonValue | null
}

@ObjectType({ description: undefined })
export class Country {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  name!: string

  @Field(() => String)
  alpha2!: string

  @Field(() => String)
  alpha3!: string

  @Field(() => String)
  countryCode!: string

  @Field(() => String)
  iso3166_2!: string

  @Field(() => String)
  region!: string

  @Field(() => String)
  subRegion!: string

  @Field(() => String)
  intermediateRegion!: string

  @Field(() => String)
  regionCode!: string

  @Field(() => String)
  subRegionCode!: string

  @Field(() => String)
  intermediateRegionCode!: string

  @Field(() => [Address], { nullable: true })
  addresses?: Partial<Address>[] | null
}

@ObjectType({ description: undefined })
export class Email {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  email!: string

  @Field(() => Boolean)
  public!: boolean

  @Field(() => Boolean)
  primary!: boolean

  @Field(() => Boolean)
  verified!: boolean

  @Field(() => String, { nullable: true })
  verifyToken?: string | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  verifyExpires?: Date | null

  @Field(() => String, { nullable: true })
  userId?: string | null

  @Field(() => EmailType)
  emailType!: EmailType

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null
}

@ObjectType({ description: undefined })
export class Invite {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => GraphQLISODateTime)
  expiresAt!: Date

  @Field(() => String)
  email!: string

  @Field(() => String)
  token!: string

  @Field(() => String)
  inviterId!: string

  @Field(() => User, { nullable: true })
  inviter?: Partial<User> | null

  @Field(() => String)
  organizationId!: string

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null

  @Field(() => InviteStatus)
  status!: InviteStatus

  @Field(() => String, { nullable: true })
  roleId?: string | null

  @Field(() => Role, { nullable: true })
  role?: Partial<Role> | null
}

@ObjectType({ description: undefined })
export class Link {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  name!: string

  @Field(() => String)
  url!: string

  @Field(() => String, { nullable: true })
  userId?: string | null

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null
}

@ObjectType({ description: undefined })
export class LoginAttempt {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String, { nullable: true })
  userId?: string | null

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String)
  email!: string

  @Field(() => Boolean)
  success!: boolean

  @Field(() => String, { nullable: true })
  ipAddress?: string | null

  @Field(() => String, { nullable: true })
  userAgent?: string | null

  @Field(() => String, { nullable: true })
  location?: string | null

  @Field(() => FailureReason, { nullable: true })
  reason?: FailureReason | null
}

@ObjectType({ description: undefined })
export class OAuthAccount {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  provider!: string

  @Field(() => String)
  providerUserId!: string

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null
}

@ObjectType({ description: undefined })
export class Organization {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  name!: string

  @Field(() => String, { nullable: true })
  logoId?: string | null

  @Field(() => StoredFile, { nullable: true })
  logo?: Partial<StoredFile> | null

  @Field(() => [Email], { nullable: true })
  emails?: Partial<Email>[] | null

  @Field(() => [Link], { nullable: true })
  links?: Partial<Link>[] | null

  @Field(() => [PhoneNumber], { nullable: true })
  phoneNumbers?: Partial<PhoneNumber>[] | null

  @Field(() => [StoredFile], { nullable: true })
  images?: Partial<StoredFile>[] | null

  @Field(() => [OrganizationMember], { nullable: true })
  members?: Partial<OrganizationMember>[] | null

  @Field(() => [Address], { nullable: true })
  addresses?: Partial<Address>[] | null

  @Field(() => [Invite], { nullable: true })
  invites?: Partial<Invite>[] | null

  @Field(() => [AuditLog], { nullable: true })
  AuditLog?: Partial<AuditLog>[] | null

  @Field(() => [Team], { nullable: true })
  Team?: Partial<Team>[] | null

  @Field(() => Subscription, { nullable: true })
  subscription?: Partial<Subscription> | null

  @Field(() => [Role], { nullable: true })
  roles?: Partial<Role>[] | null

  @Field(() => [ApiToken], { nullable: true })
  apiTokens?: Partial<ApiToken>[] | null
}

@ObjectType({ description: undefined })
export class OrganizationMember {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  roleId!: string

  @Field(() => Role, { nullable: true })
  role?: Partial<Role> | null

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String)
  organizationId!: string

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null
}

@ObjectType({ description: undefined })
export class Permission {
  @Field(() => String)
  id!: string

  @Field(() => String)
  action!: string

  @Field(() => String)
  subject!: string

  @Field(() => String, { nullable: true })
  description?: string | null

  @Field(() => [Role], { nullable: true })
  roles?: Partial<Role>[] | null
}

@ObjectType({ description: undefined })
export class PhoneNumber {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  phone!: string

  @Field(() => PhoneType)
  phoneType!: PhoneType

  @Field(() => String, { nullable: true })
  userId?: string | null

  @Field(() => Boolean)
  primary!: boolean

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null
}

@ObjectType({ description: undefined })
export class Plan {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  name!: string

  @Field(() => String, { nullable: true })
  description?: string | null

  @Field(() => GraphQLDecimal)
  price!: Decimal

  @Field(() => String)
  interval!: string

  @Field(() => GraphQLJSON, { nullable: true })
  features?: JsonValue | null

  @Field(() => GraphQLJSON, { nullable: true })
  limits?: JsonValue | null

  @Field(() => Boolean)
  active!: boolean

  @Field(() => String, { nullable: true })
  stripeProductId?: string | null

  @Field(() => String, { nullable: true })
  stripePriceId?: string | null

  @Field(() => Int, { nullable: true })
  trialPeriodDays?: number | null

  @Field(() => [Subscription], { nullable: true })
  subscriptions?: Partial<Subscription>[] | null
}

@ObjectType({ description: undefined })
export class Role {
  @Field(() => String)
  id!: string

  @Field(() => String)
  name!: string

  @Field(() => String, { nullable: true })
  description?: string | null

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null

  @Field(() => [Permission], { nullable: true })
  permissions?: Partial<Permission>[] | null

  @Field(() => [OrganizationMember], { nullable: true })
  members?: Partial<OrganizationMember>[] | null

  @Field(() => [TeamMember], { nullable: true })
  teamMembers?: Partial<TeamMember>[] | null

  @Field(() => [Invite], { nullable: true })
  invites?: Partial<Invite>[] | null
}

@ObjectType({ description: undefined })
export class SecurityEvent {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => SecurityEventType)
  eventType!: SecurityEventType

  @Field(() => String, { nullable: true })
  ipAddress?: string | null

  @Field(() => String, { nullable: true })
  userAgent?: string | null

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: JsonValue | null
}

@ObjectType({ description: undefined })
export class Subscription {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  organizationId!: string

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null

  @Field(() => String)
  planId!: string

  @Field(() => Plan, { nullable: true })
  plan?: Partial<Plan> | null

  @Field(() => String, { nullable: true })
  stripeCustomerId?: string | null

  @Field(() => String, { nullable: true })
  stripeSubscriptionId?: string | null

  @Field(() => String, { nullable: true })
  stripePriceId?: string | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  stripeCurrentPeriodEnd?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialStart?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialEnd?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  cancelAt?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  canceledAt?: Date | null

  @Field(() => Boolean)
  cancelAtPeriodEnd!: boolean

  @Field(() => SubscriptionStatus)
  status!: SubscriptionStatus
}

@ObjectType({ description: undefined })
export class Team {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  name!: string

  @Field(() => String, { nullable: true })
  description?: string | null

  @Field(() => String)
  organizationId!: string

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null

  @Field(() => [TeamMember], { nullable: true })
  members?: Partial<TeamMember>[] | null
}

@ObjectType({ description: undefined })
export class TeamMember {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  teamId!: string

  @Field(() => Team, { nullable: true })
  team?: Partial<Team> | null

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String)
  roleId!: string

  @Field(() => Role, { nullable: true })
  role?: Partial<Role> | null
}

@ObjectType({ description: undefined })
export class StoredFile {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => StorageProvider)
  provider!: StorageProvider

  @Field(() => String)
  providerFileId!: string

  @Field(() => String, { nullable: true })
  folder?: string | null

  @Field(() => String)
  filename!: string

  @Field(() => String)
  originalName!: string

  @Field(() => String)
  mimeType!: string

  @Field(() => Int)
  size!: number

  @Field(() => String)
  url!: string

  @Field(() => String, { nullable: true })
  publicUrl?: string | null

  @Field(() => Int, { nullable: true })
  width?: number | null

  @Field(() => Int, { nullable: true })
  height?: number | null

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: JsonValue | null

  @Field(() => String, { nullable: true })
  userId?: string | null

  @Field(() => String, { nullable: true })
  organizationId?: string | null

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => Organization, { nullable: true })
  organization?: Partial<Organization> | null

  @Field(() => User, { nullable: true })
  userAvatar?: Partial<User> | null

  @Field(() => Organization, { nullable: true })
  organizationLogo?: Partial<Organization> | null
}

@ObjectType({ description: undefined })
export class User {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String, { nullable: true })
  firstName?: string | null

  @Field(() => String, { nullable: true })
  lastName?: string | null

  @Field(() => Boolean)
  isSuperAdmin!: boolean

  @Field(() => String, { nullable: true })
  bio?: string | null

  @Field(() => String, { nullable: true })
  displayName?: string | null

  @Field(() => String, { nullable: true })
  password?: string | null

  @Field(() => String, { nullable: true })
  passwordResetToken?: string | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  passwordResetExpires?: Date | null

  @Field(() => Boolean)
  emailValidated!: boolean

  @Field(() => String, { nullable: true })
  validateEmailToken?: string | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  validateEmailTokenExpires?: Date | null

  @Field(() => [Email], { nullable: true })
  emails?: Partial<Email>[] | null

  @Field(() => [Link], { nullable: true })
  links?: Partial<Link>[] | null

  @Field(() => [PhoneNumber], { nullable: true })
  phoneNumbers?: Partial<PhoneNumber>[] | null

  @Field(() => String, { nullable: true })
  avatarId?: string | null

  @Field(() => StoredFile, { nullable: true })
  avatar?: Partial<StoredFile> | null

  @Field(() => [StoredFile], { nullable: true })
  images?: Partial<StoredFile>[] | null

  @Field(() => [OrganizationMember], { nullable: true })
  organizations?: Partial<OrganizationMember>[] | null

  @Field(() => String, { nullable: true })
  activeOrganizationId?: string | null

  @Field(() => [Address], { nullable: true })
  addresses?: Partial<Address>[] | null

  @Field(() => [Invite], { nullable: true })
  invitesSent?: Partial<Invite>[] | null

  @Field(() => Boolean)
  twoFactorEnabled!: boolean

  @Field(() => String, { nullable: true })
  twoFactorSecret?: string | null

  @Field(() => [String])
  twoFactorRecoveryCodes!: string[]

  @Field(() => TwoFactorMethod)
  twoFactorMethod!: TwoFactorMethod

  @Field(() => [UserSession], { nullable: true })
  activeSessions?: Partial<UserSession>[] | null

  @Field(() => [LoginAttempt], { nullable: true })
  loginAttempts?: Partial<LoginAttempt>[] | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastSuccessfulLogin?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastFailedLogin?: Date | null

  @Field(() => Int)
  failedLoginCount!: number

  @Field(() => GraphQLISODateTime, { nullable: true })
  lockedUntil?: Date | null

  @Field(() => [AuditLog], { nullable: true })
  AuditLog?: Partial<AuditLog>[] | null

  @Field(() => [UserPreference], { nullable: true })
  UserPreference?: Partial<UserPreference>[] | null

  @Field(() => [TeamMember], { nullable: true })
  TeamMember?: Partial<TeamMember>[] | null

  @Field(() => [SecurityEvent], { nullable: true })
  SecurityEvent?: Partial<SecurityEvent>[] | null

  @Field(() => Boolean)
  isActive!: boolean

  @Field(() => GraphQLISODateTime, { nullable: true })
  deactivatedAt?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  termsAcceptedAt?: Date | null

  @Field(() => GraphQLISODateTime, { nullable: true })
  privacyPolicyAcceptedAt?: Date | null

  @Field(() => [ApiToken], { nullable: true })
  apiTokens?: Partial<ApiToken>[] | null

  @Field(() => [OAuthAccount], { nullable: true })
  oAuthAccounts?: Partial<OAuthAccount>[] | null
}

@ObjectType({ description: undefined })
export class UserPreference {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String)
  key!: string

  @Field(() => String)
  value!: string
}

@ObjectType({ description: undefined })
export class UserSession {
  @Field(() => String)
  id!: string

  @Field(() => GraphQLISODateTime)
  createdAt!: Date

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date

  @Field(() => GraphQLISODateTime)
  lastActiveAt!: Date

  @Field(() => String)
  userId!: string

  @Field(() => User, { nullable: true })
  user?: Partial<User> | null

  @Field(() => String, { nullable: true })
  deviceInfo?: string | null

  @Field(() => String, { nullable: true })
  ipAddress?: string | null

  @Field(() => Boolean)
  isValid!: boolean

  @Field(() => Boolean)
  twoFactorVerified!: boolean
}
