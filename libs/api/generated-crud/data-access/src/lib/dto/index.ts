import { Field, InputType, Int, Float, GraphQLISODateTime } from '@nestjs/graphql'
import {
  AddressType,
  EmailType,
  InviteStatus,
  FailureReason,
  PhoneType,
  SecurityEventType,
  SubscriptionStatus,
  StorageProvider,
  TwoFactorMethod,
} from '@nestled-template/api/core/models'
import { GraphQLJSON } from 'graphql-type-json'

import { CorePagingInput } from '@nestled-template/api/core/data-access'

@InputType()
export class AddressTypeFilterInput {
  @Field(() => AddressType, { nullable: true })
  equals?: AddressType;

  @Field(() => [AddressType], { nullable: true })
  in?: AddressType[]

  @Field(() => AddressType, { nullable: true })
  not?: AddressType
}

@InputType()
export class BooleanFilterInput {
  @Field(() => Boolean, { nullable: true })
  equals?: boolean;

  @Field(() => [Boolean], { nullable: true })
  in?: boolean[]

  @Field(() => Boolean, { nullable: true })
  not?: boolean
}

@InputType()
export class DateTimeFilterInput {
  @Field(() => GraphQLISODateTime, { nullable: true })
  equals?: Date;

  @Field(() => [GraphQLISODateTime], { nullable: true })
  in?: Date[]

  @Field(() => GraphQLISODateTime, { nullable: true })
  not?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lte?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  gt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  gte?: Date
}

@InputType()
export class EmailTypeFilterInput {
  @Field(() => EmailType, { nullable: true })
  equals?: EmailType;

  @Field(() => [EmailType], { nullable: true })
  in?: EmailType[]

  @Field(() => EmailType, { nullable: true })
  not?: EmailType
}

@InputType()
export class FailureReasonFilterInput {
  @Field(() => FailureReason, { nullable: true })
  equals?: FailureReason;

  @Field(() => [FailureReason], { nullable: true })
  in?: FailureReason[]

  @Field(() => FailureReason, { nullable: true })
  not?: FailureReason
}

@InputType()
export class FloatFilterInput {
  @Field(() => Float, { nullable: true })
  equals?: number;

  @Field(() => [Float], { nullable: true })
  in?: number[]

  @Field(() => Float, { nullable: true })
  not?: number

  @Field(() => Float, { nullable: true })
  lt?: number

  @Field(() => Float, { nullable: true })
  lte?: number

  @Field(() => Float, { nullable: true })
  gt?: number

  @Field(() => Float, { nullable: true })
  gte?: number
}

@InputType()
export class IntFilterInput {
  @Field(() => Int, { nullable: true })
  equals?: number;

  @Field(() => [Int], { nullable: true })
  in?: number[]

  @Field(() => Int, { nullable: true })
  not?: number

  @Field(() => Int, { nullable: true })
  lt?: number

  @Field(() => Int, { nullable: true })
  lte?: number

  @Field(() => Int, { nullable: true })
  gt?: number

  @Field(() => Int, { nullable: true })
  gte?: number
}

@InputType()
export class InviteStatusFilterInput {
  @Field(() => InviteStatus, { nullable: true })
  equals?: InviteStatus;

  @Field(() => [InviteStatus], { nullable: true })
  in?: InviteStatus[]

  @Field(() => InviteStatus, { nullable: true })
  not?: InviteStatus
}

@InputType()
export class PhoneTypeFilterInput {
  @Field(() => PhoneType, { nullable: true })
  equals?: PhoneType;

  @Field(() => [PhoneType], { nullable: true })
  in?: PhoneType[]

  @Field(() => PhoneType, { nullable: true })
  not?: PhoneType
}

@InputType()
export class SecurityEventTypeFilterInput {
  @Field(() => SecurityEventType, { nullable: true })
  equals?: SecurityEventType;

  @Field(() => [SecurityEventType], { nullable: true })
  in?: SecurityEventType[]

  @Field(() => SecurityEventType, { nullable: true })
  not?: SecurityEventType
}

@InputType()
export class StorageProviderFilterInput {
  @Field(() => StorageProvider, { nullable: true })
  equals?: StorageProvider;

  @Field(() => [StorageProvider], { nullable: true })
  in?: StorageProvider[]

  @Field(() => StorageProvider, { nullable: true })
  not?: StorageProvider
}

@InputType()
export class StringFilterInput {
  @Field(() => String, { nullable: true })
  equals?: string;

  @Field(() => [String], { nullable: true })
  in?: string[]

  @Field(() => String, { nullable: true })
  not?: string

  @Field(() => String, { nullable: true })
  contains?: string

  @Field(() => String, { nullable: true })
  startsWith?: string

  @Field(() => String, { nullable: true })
  endsWith?: string
}

@InputType()
export class SubscriptionStatusFilterInput {
  @Field(() => SubscriptionStatus, { nullable: true })
  equals?: SubscriptionStatus;

  @Field(() => [SubscriptionStatus], { nullable: true })
  in?: SubscriptionStatus[]

  @Field(() => SubscriptionStatus, { nullable: true })
  not?: SubscriptionStatus
}

@InputType()
export class TwoFactorMethodFilterInput {
  @Field(() => TwoFactorMethod, { nullable: true })
  equals?: TwoFactorMethod;

  @Field(() => [TwoFactorMethod], { nullable: true })
  in?: TwoFactorMethod[]

  @Field(() => TwoFactorMethod, { nullable: true })
  not?: TwoFactorMethod
}

@InputType()
export class AddressFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  address1?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  address2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  city?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  postalCode?: StringFilterInput

  @Field(() => AddressTypeFilterInput, { nullable: true })
  addressType?: AddressTypeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isPrimary?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class ApiTokenFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  expiresAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastUsedAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  revoked?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class AuditLogFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  entityId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  entityType?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  action?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class CountryFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha3?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  iso3166_2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  regionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegionCode?: StringFilterInput
}

@InputType()
export class EmailFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  public?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  primary?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  verified?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  verifyExpires?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => EmailTypeFilterInput, { nullable: true })
  emailType?: EmailTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class InviteFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  expiresAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  token?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  inviterId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => InviteStatusFilterInput, { nullable: true })
  status?: InviteStatusFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput
}

@InputType()
export class LinkFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class LoginAttemptFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  success?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userAgent?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  location?: StringFilterInput

  @Field(() => FailureReasonFilterInput, { nullable: true })
  reason?: FailureReasonFilterInput
}

@InputType()
export class OAuthAccountFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  provider?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerUserId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput
}

@InputType()
export class OrganizationFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  logoId?: StringFilterInput
}

@InputType()
export class OrganizationMemberFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class PermissionFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  action?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subject?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput
}

@InputType()
export class PhoneNumberFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  phone?: StringFilterInput

  @Field(() => PhoneTypeFilterInput, { nullable: true })
  phoneType?: PhoneTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  primary?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class PlanFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => FloatFilterInput, { nullable: true })
  price?: FloatFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  interval?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  active?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeProductId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  trialPeriodDays?: IntFilterInput
}

@InputType()
export class RoleFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class SecurityEventFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => SecurityEventTypeFilterInput, { nullable: true })
  eventType?: SecurityEventTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userAgent?: StringFilterInput
}

@InputType()
export class SubscriptionFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  planId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeCustomerId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeSubscriptionId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  stripeCurrentPeriodEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialStart?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  cancelAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  canceledAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  cancelAtPeriodEnd?: BooleanFilterInput

  @Field(() => SubscriptionStatusFilterInput, { nullable: true })
  status?: SubscriptionStatusFilterInput
}

@InputType()
export class TeamFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class TeamMemberFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  teamId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput
}

@InputType()
export class StoredFileFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StorageProviderFilterInput, { nullable: true })
  provider?: StorageProviderFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerFileId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  folder?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  filename?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  originalName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  mimeType?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  size?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  publicUrl?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  width?: IntFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  height?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class UserFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  firstName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  lastName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isSuperAdmin?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  bio?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  displayName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  emailValidated?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  avatarId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  activeOrganizationId?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorEnabled?: BooleanFilterInput

  @Field(() => TwoFactorMethodFilterInput, { nullable: true })
  twoFactorMethod?: TwoFactorMethodFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastSuccessfulLogin?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastFailedLogin?: DateTimeFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  failedLoginCount?: IntFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lockedUntil?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isActive?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  deactivatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  termsAcceptedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  privacyPolicyAcceptedAt?: DateTimeFilterInput
}

@InputType()
export class UserPreferenceFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  key?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  value?: StringFilterInput
}

@InputType()
export class UserSessionFilterInput3 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastActiveAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  deviceInfo?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isValid?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorVerified?: BooleanFilterInput
}

@InputType()
export class AddressListRelationFilterInput2 {
  @Field(() => AddressFilterInput3, { nullable: true })
  some?: AddressFilterInput3

  @Field(() => AddressFilterInput3, { nullable: true })
  every?: AddressFilterInput3

  @Field(() => AddressFilterInput3, { nullable: true })
  none?: AddressFilterInput3
}

@InputType()
export class ApiTokenListRelationFilterInput2 {
  @Field(() => ApiTokenFilterInput3, { nullable: true })
  some?: ApiTokenFilterInput3

  @Field(() => ApiTokenFilterInput3, { nullable: true })
  every?: ApiTokenFilterInput3

  @Field(() => ApiTokenFilterInput3, { nullable: true })
  none?: ApiTokenFilterInput3
}

@InputType()
export class AuditLogListRelationFilterInput2 {
  @Field(() => AuditLogFilterInput3, { nullable: true })
  some?: AuditLogFilterInput3

  @Field(() => AuditLogFilterInput3, { nullable: true })
  every?: AuditLogFilterInput3

  @Field(() => AuditLogFilterInput3, { nullable: true })
  none?: AuditLogFilterInput3
}

@InputType()
export class EmailListRelationFilterInput2 {
  @Field(() => EmailFilterInput3, { nullable: true })
  some?: EmailFilterInput3

  @Field(() => EmailFilterInput3, { nullable: true })
  every?: EmailFilterInput3

  @Field(() => EmailFilterInput3, { nullable: true })
  none?: EmailFilterInput3
}

@InputType()
export class InviteListRelationFilterInput2 {
  @Field(() => InviteFilterInput3, { nullable: true })
  some?: InviteFilterInput3

  @Field(() => InviteFilterInput3, { nullable: true })
  every?: InviteFilterInput3

  @Field(() => InviteFilterInput3, { nullable: true })
  none?: InviteFilterInput3
}

@InputType()
export class LinkListRelationFilterInput2 {
  @Field(() => LinkFilterInput3, { nullable: true })
  some?: LinkFilterInput3

  @Field(() => LinkFilterInput3, { nullable: true })
  every?: LinkFilterInput3

  @Field(() => LinkFilterInput3, { nullable: true })
  none?: LinkFilterInput3
}

@InputType()
export class LoginAttemptListRelationFilterInput2 {
  @Field(() => LoginAttemptFilterInput3, { nullable: true })
  some?: LoginAttemptFilterInput3

  @Field(() => LoginAttemptFilterInput3, { nullable: true })
  every?: LoginAttemptFilterInput3

  @Field(() => LoginAttemptFilterInput3, { nullable: true })
  none?: LoginAttemptFilterInput3
}

@InputType()
export class OAuthAccountListRelationFilterInput2 {
  @Field(() => OAuthAccountFilterInput3, { nullable: true })
  some?: OAuthAccountFilterInput3

  @Field(() => OAuthAccountFilterInput3, { nullable: true })
  every?: OAuthAccountFilterInput3

  @Field(() => OAuthAccountFilterInput3, { nullable: true })
  none?: OAuthAccountFilterInput3
}

@InputType()
export class OrganizationMemberListRelationFilterInput2 {
  @Field(() => OrganizationMemberFilterInput3, { nullable: true })
  some?: OrganizationMemberFilterInput3

  @Field(() => OrganizationMemberFilterInput3, { nullable: true })
  every?: OrganizationMemberFilterInput3

  @Field(() => OrganizationMemberFilterInput3, { nullable: true })
  none?: OrganizationMemberFilterInput3
}

@InputType()
export class PermissionListRelationFilterInput2 {
  @Field(() => PermissionFilterInput3, { nullable: true })
  some?: PermissionFilterInput3

  @Field(() => PermissionFilterInput3, { nullable: true })
  every?: PermissionFilterInput3

  @Field(() => PermissionFilterInput3, { nullable: true })
  none?: PermissionFilterInput3
}

@InputType()
export class PhoneNumberListRelationFilterInput2 {
  @Field(() => PhoneNumberFilterInput3, { nullable: true })
  some?: PhoneNumberFilterInput3

  @Field(() => PhoneNumberFilterInput3, { nullable: true })
  every?: PhoneNumberFilterInput3

  @Field(() => PhoneNumberFilterInput3, { nullable: true })
  none?: PhoneNumberFilterInput3
}

@InputType()
export class RoleListRelationFilterInput2 {
  @Field(() => RoleFilterInput3, { nullable: true })
  some?: RoleFilterInput3

  @Field(() => RoleFilterInput3, { nullable: true })
  every?: RoleFilterInput3

  @Field(() => RoleFilterInput3, { nullable: true })
  none?: RoleFilterInput3
}

@InputType()
export class SecurityEventListRelationFilterInput2 {
  @Field(() => SecurityEventFilterInput3, { nullable: true })
  some?: SecurityEventFilterInput3

  @Field(() => SecurityEventFilterInput3, { nullable: true })
  every?: SecurityEventFilterInput3

  @Field(() => SecurityEventFilterInput3, { nullable: true })
  none?: SecurityEventFilterInput3
}

@InputType()
export class StoredFileListRelationFilterInput2 {
  @Field(() => StoredFileFilterInput3, { nullable: true })
  some?: StoredFileFilterInput3

  @Field(() => StoredFileFilterInput3, { nullable: true })
  every?: StoredFileFilterInput3

  @Field(() => StoredFileFilterInput3, { nullable: true })
  none?: StoredFileFilterInput3
}

@InputType()
export class SubscriptionListRelationFilterInput2 {
  @Field(() => SubscriptionFilterInput3, { nullable: true })
  some?: SubscriptionFilterInput3

  @Field(() => SubscriptionFilterInput3, { nullable: true })
  every?: SubscriptionFilterInput3

  @Field(() => SubscriptionFilterInput3, { nullable: true })
  none?: SubscriptionFilterInput3
}

@InputType()
export class TeamListRelationFilterInput2 {
  @Field(() => TeamFilterInput3, { nullable: true })
  some?: TeamFilterInput3

  @Field(() => TeamFilterInput3, { nullable: true })
  every?: TeamFilterInput3

  @Field(() => TeamFilterInput3, { nullable: true })
  none?: TeamFilterInput3
}

@InputType()
export class TeamMemberListRelationFilterInput2 {
  @Field(() => TeamMemberFilterInput3, { nullable: true })
  some?: TeamMemberFilterInput3

  @Field(() => TeamMemberFilterInput3, { nullable: true })
  every?: TeamMemberFilterInput3

  @Field(() => TeamMemberFilterInput3, { nullable: true })
  none?: TeamMemberFilterInput3
}

@InputType()
export class UserPreferenceListRelationFilterInput2 {
  @Field(() => UserPreferenceFilterInput3, { nullable: true })
  some?: UserPreferenceFilterInput3

  @Field(() => UserPreferenceFilterInput3, { nullable: true })
  every?: UserPreferenceFilterInput3

  @Field(() => UserPreferenceFilterInput3, { nullable: true })
  none?: UserPreferenceFilterInput3
}

@InputType()
export class UserSessionListRelationFilterInput2 {
  @Field(() => UserSessionFilterInput3, { nullable: true })
  some?: UserSessionFilterInput3

  @Field(() => UserSessionFilterInput3, { nullable: true })
  every?: UserSessionFilterInput3

  @Field(() => UserSessionFilterInput3, { nullable: true })
  none?: UserSessionFilterInput3
}

@InputType()
export class CountryRelationFilterInput2 {
  @Field(() => CountryFilterInput3, { nullable: true })
  is?: CountryFilterInput3 | null

  @Field(() => CountryFilterInput3, { nullable: true })
  isNot?: CountryFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha3?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  iso3166_2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  regionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegionCode?: StringFilterInput
}

@InputType()
export class OrganizationRelationFilterInput2 {
  @Field(() => OrganizationFilterInput3, { nullable: true })
  is?: OrganizationFilterInput3 | null

  @Field(() => OrganizationFilterInput3, { nullable: true })
  isNot?: OrganizationFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  logoId?: StringFilterInput
}

@InputType()
export class PlanRelationFilterInput2 {
  @Field(() => PlanFilterInput3, { nullable: true })
  is?: PlanFilterInput3 | null

  @Field(() => PlanFilterInput3, { nullable: true })
  isNot?: PlanFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => FloatFilterInput, { nullable: true })
  price?: FloatFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  interval?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  active?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeProductId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  trialPeriodDays?: IntFilterInput
}

@InputType()
export class RoleRelationFilterInput2 {
  @Field(() => RoleFilterInput3, { nullable: true })
  is?: RoleFilterInput3 | null

  @Field(() => RoleFilterInput3, { nullable: true })
  isNot?: RoleFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class StoredFileRelationFilterInput2 {
  @Field(() => StoredFileFilterInput3, { nullable: true })
  is?: StoredFileFilterInput3 | null

  @Field(() => StoredFileFilterInput3, { nullable: true })
  isNot?: StoredFileFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StorageProviderFilterInput, { nullable: true })
  provider?: StorageProviderFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerFileId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  folder?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  filename?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  originalName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  mimeType?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  size?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  publicUrl?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  width?: IntFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  height?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class SubscriptionRelationFilterInput2 {
  @Field(() => SubscriptionFilterInput3, { nullable: true })
  is?: SubscriptionFilterInput3 | null

  @Field(() => SubscriptionFilterInput3, { nullable: true })
  isNot?: SubscriptionFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  planId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeCustomerId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeSubscriptionId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  stripeCurrentPeriodEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialStart?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  cancelAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  canceledAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  cancelAtPeriodEnd?: BooleanFilterInput

  @Field(() => SubscriptionStatusFilterInput, { nullable: true })
  status?: SubscriptionStatusFilterInput
}

@InputType()
export class TeamRelationFilterInput2 {
  @Field(() => TeamFilterInput3, { nullable: true })
  is?: TeamFilterInput3 | null

  @Field(() => TeamFilterInput3, { nullable: true })
  isNot?: TeamFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput
}

@InputType()
export class UserRelationFilterInput2 {
  @Field(() => UserFilterInput3, { nullable: true })
  is?: UserFilterInput3 | null

  @Field(() => UserFilterInput3, { nullable: true })
  isNot?: UserFilterInput3 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  firstName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  lastName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isSuperAdmin?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  bio?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  displayName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  emailValidated?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  avatarId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  activeOrganizationId?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorEnabled?: BooleanFilterInput

  @Field(() => TwoFactorMethodFilterInput, { nullable: true })
  twoFactorMethod?: TwoFactorMethodFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastSuccessfulLogin?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastFailedLogin?: DateTimeFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  failedLoginCount?: IntFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lockedUntil?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isActive?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  deactivatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  termsAcceptedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  privacyPolicyAcceptedAt?: DateTimeFilterInput
}

@InputType()
export class AddressFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  address1?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  address2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  city?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  postalCode?: StringFilterInput

  @Field(() => AddressTypeFilterInput, { nullable: true })
  addressType?: AddressTypeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isPrimary?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryId?: StringFilterInput

  @Field(() => CountryRelationFilterInput2, { nullable: true })
  country?: CountryRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => [AddressFilterInput3], { nullable: true })
  AND?: AddressFilterInput3[]

  @Field(() => [AddressFilterInput3], { nullable: true })
  OR?: AddressFilterInput3[]

  @Field(() => [AddressFilterInput3], { nullable: true })
  NOT?: AddressFilterInput3[]
}

@InputType()
export class ApiTokenFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  expiresAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastUsedAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  revoked?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => [ApiTokenFilterInput3], { nullable: true })
  AND?: ApiTokenFilterInput3[]

  @Field(() => [ApiTokenFilterInput3], { nullable: true })
  OR?: ApiTokenFilterInput3[]

  @Field(() => [ApiTokenFilterInput3], { nullable: true })
  NOT?: ApiTokenFilterInput3[]
}

@InputType()
export class AuditLogFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  entityId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  entityType?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  action?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => [AuditLogFilterInput3], { nullable: true })
  AND?: AuditLogFilterInput3[]

  @Field(() => [AuditLogFilterInput3], { nullable: true })
  OR?: AuditLogFilterInput3[]

  @Field(() => [AuditLogFilterInput3], { nullable: true })
  NOT?: AuditLogFilterInput3[]
}

@InputType()
export class CountryFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha3?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  iso3166_2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  regionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegionCode?: StringFilterInput

  @Field(() => AddressListRelationFilterInput2, { nullable: true })
  addresses?: AddressListRelationFilterInput2

  @Field(() => [CountryFilterInput3], { nullable: true })
  AND?: CountryFilterInput3[]

  @Field(() => [CountryFilterInput3], { nullable: true })
  OR?: CountryFilterInput3[]

  @Field(() => [CountryFilterInput3], { nullable: true })
  NOT?: CountryFilterInput3[]
}

@InputType()
export class EmailFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  public?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  primary?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  verified?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  verifyExpires?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => EmailTypeFilterInput, { nullable: true })
  emailType?: EmailTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => [EmailFilterInput3], { nullable: true })
  AND?: EmailFilterInput3[]

  @Field(() => [EmailFilterInput3], { nullable: true })
  OR?: EmailFilterInput3[]

  @Field(() => [EmailFilterInput3], { nullable: true })
  NOT?: EmailFilterInput3[]
}

@InputType()
export class InviteFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  expiresAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  token?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  inviterId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  inviter?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => InviteStatusFilterInput, { nullable: true })
  status?: InviteStatusFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput

  @Field(() => RoleRelationFilterInput2, { nullable: true })
  role?: RoleRelationFilterInput2

  @Field(() => [InviteFilterInput3], { nullable: true })
  AND?: InviteFilterInput3[]

  @Field(() => [InviteFilterInput3], { nullable: true })
  OR?: InviteFilterInput3[]

  @Field(() => [InviteFilterInput3], { nullable: true })
  NOT?: InviteFilterInput3[]
}

@InputType()
export class LinkFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => [LinkFilterInput3], { nullable: true })
  AND?: LinkFilterInput3[]

  @Field(() => [LinkFilterInput3], { nullable: true })
  OR?: LinkFilterInput3[]

  @Field(() => [LinkFilterInput3], { nullable: true })
  NOT?: LinkFilterInput3[]
}

@InputType()
export class LoginAttemptFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  success?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userAgent?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  location?: StringFilterInput

  @Field(() => FailureReasonFilterInput, { nullable: true })
  reason?: FailureReasonFilterInput

  @Field(() => [LoginAttemptFilterInput3], { nullable: true })
  AND?: LoginAttemptFilterInput3[]

  @Field(() => [LoginAttemptFilterInput3], { nullable: true })
  OR?: LoginAttemptFilterInput3[]

  @Field(() => [LoginAttemptFilterInput3], { nullable: true })
  NOT?: LoginAttemptFilterInput3[]
}

@InputType()
export class OAuthAccountFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  provider?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerUserId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => [OAuthAccountFilterInput3], { nullable: true })
  AND?: OAuthAccountFilterInput3[]

  @Field(() => [OAuthAccountFilterInput3], { nullable: true })
  OR?: OAuthAccountFilterInput3[]

  @Field(() => [OAuthAccountFilterInput3], { nullable: true })
  NOT?: OAuthAccountFilterInput3[]
}

@InputType()
export class OrganizationFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  logoId?: StringFilterInput

  @Field(() => StoredFileRelationFilterInput2, { nullable: true })
  logo?: StoredFileRelationFilterInput2

  @Field(() => EmailListRelationFilterInput2, { nullable: true })
  emails?: EmailListRelationFilterInput2

  @Field(() => LinkListRelationFilterInput2, { nullable: true })
  links?: LinkListRelationFilterInput2

  @Field(() => PhoneNumberListRelationFilterInput2, { nullable: true })
  phoneNumbers?: PhoneNumberListRelationFilterInput2

  @Field(() => StoredFileListRelationFilterInput2, { nullable: true })
  images?: StoredFileListRelationFilterInput2

  @Field(() => OrganizationMemberListRelationFilterInput2, { nullable: true })
  members?: OrganizationMemberListRelationFilterInput2

  @Field(() => AddressListRelationFilterInput2, { nullable: true })
  addresses?: AddressListRelationFilterInput2

  @Field(() => InviteListRelationFilterInput2, { nullable: true })
  invites?: InviteListRelationFilterInput2

  @Field(() => AuditLogListRelationFilterInput2, { nullable: true })
  AuditLog?: AuditLogListRelationFilterInput2

  @Field(() => TeamListRelationFilterInput2, { nullable: true })
  Team?: TeamListRelationFilterInput2

  @Field(() => SubscriptionRelationFilterInput2, { nullable: true })
  subscription?: SubscriptionRelationFilterInput2

  @Field(() => RoleListRelationFilterInput2, { nullable: true })
  roles?: RoleListRelationFilterInput2

  @Field(() => ApiTokenListRelationFilterInput2, { nullable: true })
  apiTokens?: ApiTokenListRelationFilterInput2

  @Field(() => [OrganizationFilterInput3], { nullable: true })
  AND?: OrganizationFilterInput3[]

  @Field(() => [OrganizationFilterInput3], { nullable: true })
  OR?: OrganizationFilterInput3[]

  @Field(() => [OrganizationFilterInput3], { nullable: true })
  NOT?: OrganizationFilterInput3[]
}

@InputType()
export class OrganizationMemberFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput

  @Field(() => RoleRelationFilterInput2, { nullable: true })
  role?: RoleRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => [OrganizationMemberFilterInput3], { nullable: true })
  AND?: OrganizationMemberFilterInput3[]

  @Field(() => [OrganizationMemberFilterInput3], { nullable: true })
  OR?: OrganizationMemberFilterInput3[]

  @Field(() => [OrganizationMemberFilterInput3], { nullable: true })
  NOT?: OrganizationMemberFilterInput3[]
}

@InputType()
export class PermissionFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  action?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subject?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => RoleListRelationFilterInput2, { nullable: true })
  roles?: RoleListRelationFilterInput2

  @Field(() => [PermissionFilterInput3], { nullable: true })
  AND?: PermissionFilterInput3[]

  @Field(() => [PermissionFilterInput3], { nullable: true })
  OR?: PermissionFilterInput3[]

  @Field(() => [PermissionFilterInput3], { nullable: true })
  NOT?: PermissionFilterInput3[]
}

@InputType()
export class PhoneNumberFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  phone?: StringFilterInput

  @Field(() => PhoneTypeFilterInput, { nullable: true })
  phoneType?: PhoneTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  primary?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => [PhoneNumberFilterInput3], { nullable: true })
  AND?: PhoneNumberFilterInput3[]

  @Field(() => [PhoneNumberFilterInput3], { nullable: true })
  OR?: PhoneNumberFilterInput3[]

  @Field(() => [PhoneNumberFilterInput3], { nullable: true })
  NOT?: PhoneNumberFilterInput3[]
}

@InputType()
export class PlanFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => FloatFilterInput, { nullable: true })
  price?: FloatFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  interval?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  active?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeProductId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  trialPeriodDays?: IntFilterInput

  @Field(() => SubscriptionListRelationFilterInput2, { nullable: true })
  subscriptions?: SubscriptionListRelationFilterInput2

  @Field(() => [PlanFilterInput3], { nullable: true })
  AND?: PlanFilterInput3[]

  @Field(() => [PlanFilterInput3], { nullable: true })
  OR?: PlanFilterInput3[]

  @Field(() => [PlanFilterInput3], { nullable: true })
  NOT?: PlanFilterInput3[]
}

@InputType()
export class RoleFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => PermissionListRelationFilterInput2, { nullable: true })
  permissions?: PermissionListRelationFilterInput2

  @Field(() => OrganizationMemberListRelationFilterInput2, { nullable: true })
  members?: OrganizationMemberListRelationFilterInput2

  @Field(() => TeamMemberListRelationFilterInput2, { nullable: true })
  teamMembers?: TeamMemberListRelationFilterInput2

  @Field(() => InviteListRelationFilterInput2, { nullable: true })
  invites?: InviteListRelationFilterInput2

  @Field(() => [RoleFilterInput3], { nullable: true })
  AND?: RoleFilterInput3[]

  @Field(() => [RoleFilterInput3], { nullable: true })
  OR?: RoleFilterInput3[]

  @Field(() => [RoleFilterInput3], { nullable: true })
  NOT?: RoleFilterInput3[]
}

@InputType()
export class SecurityEventFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => SecurityEventTypeFilterInput, { nullable: true })
  eventType?: SecurityEventTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userAgent?: StringFilterInput

  @Field(() => [SecurityEventFilterInput3], { nullable: true })
  AND?: SecurityEventFilterInput3[]

  @Field(() => [SecurityEventFilterInput3], { nullable: true })
  OR?: SecurityEventFilterInput3[]

  @Field(() => [SecurityEventFilterInput3], { nullable: true })
  NOT?: SecurityEventFilterInput3[]
}

@InputType()
export class SubscriptionFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  planId?: StringFilterInput

  @Field(() => PlanRelationFilterInput2, { nullable: true })
  plan?: PlanRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  stripeCustomerId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeSubscriptionId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  stripeCurrentPeriodEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialStart?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  cancelAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  canceledAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  cancelAtPeriodEnd?: BooleanFilterInput

  @Field(() => SubscriptionStatusFilterInput, { nullable: true })
  status?: SubscriptionStatusFilterInput

  @Field(() => [SubscriptionFilterInput3], { nullable: true })
  AND?: SubscriptionFilterInput3[]

  @Field(() => [SubscriptionFilterInput3], { nullable: true })
  OR?: SubscriptionFilterInput3[]

  @Field(() => [SubscriptionFilterInput3], { nullable: true })
  NOT?: SubscriptionFilterInput3[]
}

@InputType()
export class TeamFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => TeamMemberListRelationFilterInput2, { nullable: true })
  members?: TeamMemberListRelationFilterInput2

  @Field(() => [TeamFilterInput3], { nullable: true })
  AND?: TeamFilterInput3[]

  @Field(() => [TeamFilterInput3], { nullable: true })
  OR?: TeamFilterInput3[]

  @Field(() => [TeamFilterInput3], { nullable: true })
  NOT?: TeamFilterInput3[]
}

@InputType()
export class TeamMemberFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  teamId?: StringFilterInput

  @Field(() => TeamRelationFilterInput2, { nullable: true })
  team?: TeamRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput

  @Field(() => RoleRelationFilterInput2, { nullable: true })
  role?: RoleRelationFilterInput2

  @Field(() => [TeamMemberFilterInput3], { nullable: true })
  AND?: TeamMemberFilterInput3[]

  @Field(() => [TeamMemberFilterInput3], { nullable: true })
  OR?: TeamMemberFilterInput3[]

  @Field(() => [TeamMemberFilterInput3], { nullable: true })
  NOT?: TeamMemberFilterInput3[]
}

@InputType()
export class StoredFileFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StorageProviderFilterInput, { nullable: true })
  provider?: StorageProviderFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerFileId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  folder?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  filename?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  originalName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  mimeType?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  size?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  publicUrl?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  width?: IntFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  height?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => UserRelationFilterInput2, { nullable: true })
  userAvatar?: UserRelationFilterInput2

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organizationLogo?: OrganizationRelationFilterInput2

  @Field(() => [StoredFileFilterInput3], { nullable: true })
  AND?: StoredFileFilterInput3[]

  @Field(() => [StoredFileFilterInput3], { nullable: true })
  OR?: StoredFileFilterInput3[]

  @Field(() => [StoredFileFilterInput3], { nullable: true })
  NOT?: StoredFileFilterInput3[]
}

@InputType()
export class UserFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  firstName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  lastName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isSuperAdmin?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  bio?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  displayName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  emailValidated?: BooleanFilterInput

  @Field(() => EmailListRelationFilterInput2, { nullable: true })
  emails?: EmailListRelationFilterInput2

  @Field(() => LinkListRelationFilterInput2, { nullable: true })
  links?: LinkListRelationFilterInput2

  @Field(() => PhoneNumberListRelationFilterInput2, { nullable: true })
  phoneNumbers?: PhoneNumberListRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  avatarId?: StringFilterInput

  @Field(() => StoredFileRelationFilterInput2, { nullable: true })
  avatar?: StoredFileRelationFilterInput2

  @Field(() => StoredFileListRelationFilterInput2, { nullable: true })
  images?: StoredFileListRelationFilterInput2

  @Field(() => OrganizationMemberListRelationFilterInput2, { nullable: true })
  organizations?: OrganizationMemberListRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  activeOrganizationId?: StringFilterInput

  @Field(() => AddressListRelationFilterInput2, { nullable: true })
  addresses?: AddressListRelationFilterInput2

  @Field(() => InviteListRelationFilterInput2, { nullable: true })
  invitesSent?: InviteListRelationFilterInput2

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorEnabled?: BooleanFilterInput

  @Field(() => TwoFactorMethodFilterInput, { nullable: true })
  twoFactorMethod?: TwoFactorMethodFilterInput

  @Field(() => UserSessionListRelationFilterInput2, { nullable: true })
  activeSessions?: UserSessionListRelationFilterInput2

  @Field(() => LoginAttemptListRelationFilterInput2, { nullable: true })
  loginAttempts?: LoginAttemptListRelationFilterInput2

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastSuccessfulLogin?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastFailedLogin?: DateTimeFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  failedLoginCount?: IntFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lockedUntil?: DateTimeFilterInput

  @Field(() => AuditLogListRelationFilterInput2, { nullable: true })
  AuditLog?: AuditLogListRelationFilterInput2

  @Field(() => UserPreferenceListRelationFilterInput2, { nullable: true })
  UserPreference?: UserPreferenceListRelationFilterInput2

  @Field(() => TeamMemberListRelationFilterInput2, { nullable: true })
  TeamMember?: TeamMemberListRelationFilterInput2

  @Field(() => SecurityEventListRelationFilterInput2, { nullable: true })
  SecurityEvent?: SecurityEventListRelationFilterInput2

  @Field(() => BooleanFilterInput, { nullable: true })
  isActive?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  deactivatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  termsAcceptedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  privacyPolicyAcceptedAt?: DateTimeFilterInput

  @Field(() => ApiTokenListRelationFilterInput2, { nullable: true })
  apiTokens?: ApiTokenListRelationFilterInput2

  @Field(() => OAuthAccountListRelationFilterInput2, { nullable: true })
  oAuthAccounts?: OAuthAccountListRelationFilterInput2

  @Field(() => [UserFilterInput3], { nullable: true })
  AND?: UserFilterInput3[]

  @Field(() => [UserFilterInput3], { nullable: true })
  OR?: UserFilterInput3[]

  @Field(() => [UserFilterInput3], { nullable: true })
  NOT?: UserFilterInput3[]
}

@InputType()
export class UserPreferenceFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  key?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  value?: StringFilterInput

  @Field(() => [UserPreferenceFilterInput3], { nullable: true })
  AND?: UserPreferenceFilterInput3[]

  @Field(() => [UserPreferenceFilterInput3], { nullable: true })
  OR?: UserPreferenceFilterInput3[]

  @Field(() => [UserPreferenceFilterInput3], { nullable: true })
  NOT?: UserPreferenceFilterInput3[]
}

@InputType()
export class UserSessionFilterInput2 {
  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastActiveAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  deviceInfo?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isValid?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorVerified?: BooleanFilterInput

  @Field(() => [UserSessionFilterInput3], { nullable: true })
  AND?: UserSessionFilterInput3[]

  @Field(() => [UserSessionFilterInput3], { nullable: true })
  OR?: UserSessionFilterInput3[]

  @Field(() => [UserSessionFilterInput3], { nullable: true })
  NOT?: UserSessionFilterInput3[]
}

@InputType()
export class AddressListRelationFilterInput {
  @Field(() => AddressFilterInput2, { nullable: true })
  some?: AddressFilterInput2

  @Field(() => AddressFilterInput2, { nullable: true })
  every?: AddressFilterInput2

  @Field(() => AddressFilterInput2, { nullable: true })
  none?: AddressFilterInput2
}

@InputType()
export class ApiTokenListRelationFilterInput {
  @Field(() => ApiTokenFilterInput2, { nullable: true })
  some?: ApiTokenFilterInput2

  @Field(() => ApiTokenFilterInput2, { nullable: true })
  every?: ApiTokenFilterInput2

  @Field(() => ApiTokenFilterInput2, { nullable: true })
  none?: ApiTokenFilterInput2
}

@InputType()
export class AuditLogListRelationFilterInput {
  @Field(() => AuditLogFilterInput2, { nullable: true })
  some?: AuditLogFilterInput2

  @Field(() => AuditLogFilterInput2, { nullable: true })
  every?: AuditLogFilterInput2

  @Field(() => AuditLogFilterInput2, { nullable: true })
  none?: AuditLogFilterInput2
}

@InputType()
export class EmailListRelationFilterInput {
  @Field(() => EmailFilterInput2, { nullable: true })
  some?: EmailFilterInput2

  @Field(() => EmailFilterInput2, { nullable: true })
  every?: EmailFilterInput2

  @Field(() => EmailFilterInput2, { nullable: true })
  none?: EmailFilterInput2
}

@InputType()
export class InviteListRelationFilterInput {
  @Field(() => InviteFilterInput2, { nullable: true })
  some?: InviteFilterInput2

  @Field(() => InviteFilterInput2, { nullable: true })
  every?: InviteFilterInput2

  @Field(() => InviteFilterInput2, { nullable: true })
  none?: InviteFilterInput2
}

@InputType()
export class LinkListRelationFilterInput {
  @Field(() => LinkFilterInput2, { nullable: true })
  some?: LinkFilterInput2

  @Field(() => LinkFilterInput2, { nullable: true })
  every?: LinkFilterInput2

  @Field(() => LinkFilterInput2, { nullable: true })
  none?: LinkFilterInput2
}

@InputType()
export class LoginAttemptListRelationFilterInput {
  @Field(() => LoginAttemptFilterInput2, { nullable: true })
  some?: LoginAttemptFilterInput2

  @Field(() => LoginAttemptFilterInput2, { nullable: true })
  every?: LoginAttemptFilterInput2

  @Field(() => LoginAttemptFilterInput2, { nullable: true })
  none?: LoginAttemptFilterInput2
}

@InputType()
export class OAuthAccountListRelationFilterInput {
  @Field(() => OAuthAccountFilterInput2, { nullable: true })
  some?: OAuthAccountFilterInput2

  @Field(() => OAuthAccountFilterInput2, { nullable: true })
  every?: OAuthAccountFilterInput2

  @Field(() => OAuthAccountFilterInput2, { nullable: true })
  none?: OAuthAccountFilterInput2
}

@InputType()
export class OrganizationMemberListRelationFilterInput {
  @Field(() => OrganizationMemberFilterInput2, { nullable: true })
  some?: OrganizationMemberFilterInput2

  @Field(() => OrganizationMemberFilterInput2, { nullable: true })
  every?: OrganizationMemberFilterInput2

  @Field(() => OrganizationMemberFilterInput2, { nullable: true })
  none?: OrganizationMemberFilterInput2
}

@InputType()
export class PermissionListRelationFilterInput {
  @Field(() => PermissionFilterInput2, { nullable: true })
  some?: PermissionFilterInput2

  @Field(() => PermissionFilterInput2, { nullable: true })
  every?: PermissionFilterInput2

  @Field(() => PermissionFilterInput2, { nullable: true })
  none?: PermissionFilterInput2
}

@InputType()
export class PhoneNumberListRelationFilterInput {
  @Field(() => PhoneNumberFilterInput2, { nullable: true })
  some?: PhoneNumberFilterInput2

  @Field(() => PhoneNumberFilterInput2, { nullable: true })
  every?: PhoneNumberFilterInput2

  @Field(() => PhoneNumberFilterInput2, { nullable: true })
  none?: PhoneNumberFilterInput2
}

@InputType()
export class RoleListRelationFilterInput {
  @Field(() => RoleFilterInput2, { nullable: true })
  some?: RoleFilterInput2

  @Field(() => RoleFilterInput2, { nullable: true })
  every?: RoleFilterInput2

  @Field(() => RoleFilterInput2, { nullable: true })
  none?: RoleFilterInput2
}

@InputType()
export class SecurityEventListRelationFilterInput {
  @Field(() => SecurityEventFilterInput2, { nullable: true })
  some?: SecurityEventFilterInput2

  @Field(() => SecurityEventFilterInput2, { nullable: true })
  every?: SecurityEventFilterInput2

  @Field(() => SecurityEventFilterInput2, { nullable: true })
  none?: SecurityEventFilterInput2
}

@InputType()
export class StoredFileListRelationFilterInput {
  @Field(() => StoredFileFilterInput2, { nullable: true })
  some?: StoredFileFilterInput2

  @Field(() => StoredFileFilterInput2, { nullable: true })
  every?: StoredFileFilterInput2

  @Field(() => StoredFileFilterInput2, { nullable: true })
  none?: StoredFileFilterInput2
}

@InputType()
export class SubscriptionListRelationFilterInput {
  @Field(() => SubscriptionFilterInput2, { nullable: true })
  some?: SubscriptionFilterInput2

  @Field(() => SubscriptionFilterInput2, { nullable: true })
  every?: SubscriptionFilterInput2

  @Field(() => SubscriptionFilterInput2, { nullable: true })
  none?: SubscriptionFilterInput2
}

@InputType()
export class TeamListRelationFilterInput {
  @Field(() => TeamFilterInput2, { nullable: true })
  some?: TeamFilterInput2

  @Field(() => TeamFilterInput2, { nullable: true })
  every?: TeamFilterInput2

  @Field(() => TeamFilterInput2, { nullable: true })
  none?: TeamFilterInput2
}

@InputType()
export class TeamMemberListRelationFilterInput {
  @Field(() => TeamMemberFilterInput2, { nullable: true })
  some?: TeamMemberFilterInput2

  @Field(() => TeamMemberFilterInput2, { nullable: true })
  every?: TeamMemberFilterInput2

  @Field(() => TeamMemberFilterInput2, { nullable: true })
  none?: TeamMemberFilterInput2
}

@InputType()
export class UserPreferenceListRelationFilterInput {
  @Field(() => UserPreferenceFilterInput2, { nullable: true })
  some?: UserPreferenceFilterInput2

  @Field(() => UserPreferenceFilterInput2, { nullable: true })
  every?: UserPreferenceFilterInput2

  @Field(() => UserPreferenceFilterInput2, { nullable: true })
  none?: UserPreferenceFilterInput2
}

@InputType()
export class UserSessionListRelationFilterInput {
  @Field(() => UserSessionFilterInput2, { nullable: true })
  some?: UserSessionFilterInput2

  @Field(() => UserSessionFilterInput2, { nullable: true })
  every?: UserSessionFilterInput2

  @Field(() => UserSessionFilterInput2, { nullable: true })
  none?: UserSessionFilterInput2
}

@InputType()
export class CountryRelationFilterInput {
  @Field(() => CountryFilterInput2, { nullable: true })
  is?: CountryFilterInput2 | null

  @Field(() => CountryFilterInput2, { nullable: true })
  isNot?: CountryFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha3?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  iso3166_2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  regionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegionCode?: StringFilterInput

  @Field(() => AddressListRelationFilterInput2, { nullable: true })
  addresses?: AddressListRelationFilterInput2

  @Field(() => [CountryFilterInput3], { nullable: true })
  AND?: CountryFilterInput3[]

  @Field(() => [CountryFilterInput3], { nullable: true })
  OR?: CountryFilterInput3[]

  @Field(() => [CountryFilterInput3], { nullable: true })
  NOT?: CountryFilterInput3[]
}

@InputType()
export class OrganizationRelationFilterInput {
  @Field(() => OrganizationFilterInput2, { nullable: true })
  is?: OrganizationFilterInput2 | null

  @Field(() => OrganizationFilterInput2, { nullable: true })
  isNot?: OrganizationFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  logoId?: StringFilterInput

  @Field(() => StoredFileRelationFilterInput2, { nullable: true })
  logo?: StoredFileRelationFilterInput2

  @Field(() => EmailListRelationFilterInput2, { nullable: true })
  emails?: EmailListRelationFilterInput2

  @Field(() => LinkListRelationFilterInput2, { nullable: true })
  links?: LinkListRelationFilterInput2

  @Field(() => PhoneNumberListRelationFilterInput2, { nullable: true })
  phoneNumbers?: PhoneNumberListRelationFilterInput2

  @Field(() => StoredFileListRelationFilterInput2, { nullable: true })
  images?: StoredFileListRelationFilterInput2

  @Field(() => OrganizationMemberListRelationFilterInput2, { nullable: true })
  members?: OrganizationMemberListRelationFilterInput2

  @Field(() => AddressListRelationFilterInput2, { nullable: true })
  addresses?: AddressListRelationFilterInput2

  @Field(() => InviteListRelationFilterInput2, { nullable: true })
  invites?: InviteListRelationFilterInput2

  @Field(() => AuditLogListRelationFilterInput2, { nullable: true })
  AuditLog?: AuditLogListRelationFilterInput2

  @Field(() => TeamListRelationFilterInput2, { nullable: true })
  Team?: TeamListRelationFilterInput2

  @Field(() => SubscriptionRelationFilterInput2, { nullable: true })
  subscription?: SubscriptionRelationFilterInput2

  @Field(() => RoleListRelationFilterInput2, { nullable: true })
  roles?: RoleListRelationFilterInput2

  @Field(() => ApiTokenListRelationFilterInput2, { nullable: true })
  apiTokens?: ApiTokenListRelationFilterInput2

  @Field(() => [OrganizationFilterInput3], { nullable: true })
  AND?: OrganizationFilterInput3[]

  @Field(() => [OrganizationFilterInput3], { nullable: true })
  OR?: OrganizationFilterInput3[]

  @Field(() => [OrganizationFilterInput3], { nullable: true })
  NOT?: OrganizationFilterInput3[]
}

@InputType()
export class PlanRelationFilterInput {
  @Field(() => PlanFilterInput2, { nullable: true })
  is?: PlanFilterInput2 | null

  @Field(() => PlanFilterInput2, { nullable: true })
  isNot?: PlanFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => FloatFilterInput, { nullable: true })
  price?: FloatFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  interval?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  active?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeProductId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  trialPeriodDays?: IntFilterInput

  @Field(() => SubscriptionListRelationFilterInput2, { nullable: true })
  subscriptions?: SubscriptionListRelationFilterInput2

  @Field(() => [PlanFilterInput3], { nullable: true })
  AND?: PlanFilterInput3[]

  @Field(() => [PlanFilterInput3], { nullable: true })
  OR?: PlanFilterInput3[]

  @Field(() => [PlanFilterInput3], { nullable: true })
  NOT?: PlanFilterInput3[]
}

@InputType()
export class RoleRelationFilterInput {
  @Field(() => RoleFilterInput2, { nullable: true })
  is?: RoleFilterInput2 | null

  @Field(() => RoleFilterInput2, { nullable: true })
  isNot?: RoleFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => PermissionListRelationFilterInput2, { nullable: true })
  permissions?: PermissionListRelationFilterInput2

  @Field(() => OrganizationMemberListRelationFilterInput2, { nullable: true })
  members?: OrganizationMemberListRelationFilterInput2

  @Field(() => TeamMemberListRelationFilterInput2, { nullable: true })
  teamMembers?: TeamMemberListRelationFilterInput2

  @Field(() => InviteListRelationFilterInput2, { nullable: true })
  invites?: InviteListRelationFilterInput2

  @Field(() => [RoleFilterInput3], { nullable: true })
  AND?: RoleFilterInput3[]

  @Field(() => [RoleFilterInput3], { nullable: true })
  OR?: RoleFilterInput3[]

  @Field(() => [RoleFilterInput3], { nullable: true })
  NOT?: RoleFilterInput3[]
}

@InputType()
export class StoredFileRelationFilterInput {
  @Field(() => StoredFileFilterInput2, { nullable: true })
  is?: StoredFileFilterInput2 | null

  @Field(() => StoredFileFilterInput2, { nullable: true })
  isNot?: StoredFileFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StorageProviderFilterInput, { nullable: true })
  provider?: StorageProviderFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerFileId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  folder?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  filename?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  originalName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  mimeType?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  size?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  publicUrl?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  width?: IntFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  height?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput2, { nullable: true })
  user?: UserRelationFilterInput2

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => UserRelationFilterInput2, { nullable: true })
  userAvatar?: UserRelationFilterInput2

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organizationLogo?: OrganizationRelationFilterInput2

  @Field(() => [StoredFileFilterInput3], { nullable: true })
  AND?: StoredFileFilterInput3[]

  @Field(() => [StoredFileFilterInput3], { nullable: true })
  OR?: StoredFileFilterInput3[]

  @Field(() => [StoredFileFilterInput3], { nullable: true })
  NOT?: StoredFileFilterInput3[]
}

@InputType()
export class SubscriptionRelationFilterInput {
  @Field(() => SubscriptionFilterInput2, { nullable: true })
  is?: SubscriptionFilterInput2 | null

  @Field(() => SubscriptionFilterInput2, { nullable: true })
  isNot?: SubscriptionFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  planId?: StringFilterInput

  @Field(() => PlanRelationFilterInput2, { nullable: true })
  plan?: PlanRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  stripeCustomerId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeSubscriptionId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  stripeCurrentPeriodEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialStart?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  cancelAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  canceledAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  cancelAtPeriodEnd?: BooleanFilterInput

  @Field(() => SubscriptionStatusFilterInput, { nullable: true })
  status?: SubscriptionStatusFilterInput

  @Field(() => [SubscriptionFilterInput3], { nullable: true })
  AND?: SubscriptionFilterInput3[]

  @Field(() => [SubscriptionFilterInput3], { nullable: true })
  OR?: SubscriptionFilterInput3[]

  @Field(() => [SubscriptionFilterInput3], { nullable: true })
  NOT?: SubscriptionFilterInput3[]
}

@InputType()
export class TeamRelationFilterInput {
  @Field(() => TeamFilterInput2, { nullable: true })
  is?: TeamFilterInput2 | null

  @Field(() => TeamFilterInput2, { nullable: true })
  isNot?: TeamFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput2, { nullable: true })
  organization?: OrganizationRelationFilterInput2

  @Field(() => TeamMemberListRelationFilterInput2, { nullable: true })
  members?: TeamMemberListRelationFilterInput2

  @Field(() => [TeamFilterInput3], { nullable: true })
  AND?: TeamFilterInput3[]

  @Field(() => [TeamFilterInput3], { nullable: true })
  OR?: TeamFilterInput3[]

  @Field(() => [TeamFilterInput3], { nullable: true })
  NOT?: TeamFilterInput3[]
}

@InputType()
export class UserRelationFilterInput {
  @Field(() => UserFilterInput2, { nullable: true })
  is?: UserFilterInput2 | null

  @Field(() => UserFilterInput2, { nullable: true })
  isNot?: UserFilterInput2 | null

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  firstName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  lastName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isSuperAdmin?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  bio?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  displayName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  emailValidated?: BooleanFilterInput

  @Field(() => EmailListRelationFilterInput2, { nullable: true })
  emails?: EmailListRelationFilterInput2

  @Field(() => LinkListRelationFilterInput2, { nullable: true })
  links?: LinkListRelationFilterInput2

  @Field(() => PhoneNumberListRelationFilterInput2, { nullable: true })
  phoneNumbers?: PhoneNumberListRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  avatarId?: StringFilterInput

  @Field(() => StoredFileRelationFilterInput2, { nullable: true })
  avatar?: StoredFileRelationFilterInput2

  @Field(() => StoredFileListRelationFilterInput2, { nullable: true })
  images?: StoredFileListRelationFilterInput2

  @Field(() => OrganizationMemberListRelationFilterInput2, { nullable: true })
  organizations?: OrganizationMemberListRelationFilterInput2

  @Field(() => StringFilterInput, { nullable: true })
  activeOrganizationId?: StringFilterInput

  @Field(() => AddressListRelationFilterInput2, { nullable: true })
  addresses?: AddressListRelationFilterInput2

  @Field(() => InviteListRelationFilterInput2, { nullable: true })
  invitesSent?: InviteListRelationFilterInput2

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorEnabled?: BooleanFilterInput

  @Field(() => TwoFactorMethodFilterInput, { nullable: true })
  twoFactorMethod?: TwoFactorMethodFilterInput

  @Field(() => UserSessionListRelationFilterInput2, { nullable: true })
  activeSessions?: UserSessionListRelationFilterInput2

  @Field(() => LoginAttemptListRelationFilterInput2, { nullable: true })
  loginAttempts?: LoginAttemptListRelationFilterInput2

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastSuccessfulLogin?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastFailedLogin?: DateTimeFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  failedLoginCount?: IntFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lockedUntil?: DateTimeFilterInput

  @Field(() => AuditLogListRelationFilterInput2, { nullable: true })
  AuditLog?: AuditLogListRelationFilterInput2

  @Field(() => UserPreferenceListRelationFilterInput2, { nullable: true })
  UserPreference?: UserPreferenceListRelationFilterInput2

  @Field(() => TeamMemberListRelationFilterInput2, { nullable: true })
  TeamMember?: TeamMemberListRelationFilterInput2

  @Field(() => SecurityEventListRelationFilterInput2, { nullable: true })
  SecurityEvent?: SecurityEventListRelationFilterInput2

  @Field(() => BooleanFilterInput, { nullable: true })
  isActive?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  deactivatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  termsAcceptedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  privacyPolicyAcceptedAt?: DateTimeFilterInput

  @Field(() => ApiTokenListRelationFilterInput2, { nullable: true })
  apiTokens?: ApiTokenListRelationFilterInput2

  @Field(() => OAuthAccountListRelationFilterInput2, { nullable: true })
  oAuthAccounts?: OAuthAccountListRelationFilterInput2

  @Field(() => [UserFilterInput3], { nullable: true })
  AND?: UserFilterInput3[]

  @Field(() => [UserFilterInput3], { nullable: true })
  OR?: UserFilterInput3[]

  @Field(() => [UserFilterInput3], { nullable: true })
  NOT?: UserFilterInput3[]
}

@InputType()
export class AddressFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  address1?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  address2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  city?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  postalCode?: StringFilterInput

  @Field(() => AddressTypeFilterInput, { nullable: true })
  addressType?: AddressTypeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isPrimary?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryId?: StringFilterInput

  @Field(() => CountryRelationFilterInput, { nullable: true })
  country?: CountryRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => [AddressFilterInput2], { nullable: true })
  AND?: AddressFilterInput2[]

  @Field(() => [AddressFilterInput2], { nullable: true })
  OR?: AddressFilterInput2[]

  @Field(() => [AddressFilterInput2], { nullable: true })
  NOT?: AddressFilterInput2[]
}

@InputType()
export class ApiTokenFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  expiresAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastUsedAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  revoked?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => [ApiTokenFilterInput2], { nullable: true })
  AND?: ApiTokenFilterInput2[]

  @Field(() => [ApiTokenFilterInput2], { nullable: true })
  OR?: ApiTokenFilterInput2[]

  @Field(() => [ApiTokenFilterInput2], { nullable: true })
  NOT?: ApiTokenFilterInput2[]
}

@InputType()
export class AuditLogFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  entityId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  entityType?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  action?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => [AuditLogFilterInput2], { nullable: true })
  AND?: AuditLogFilterInput2[]

  @Field(() => [AuditLogFilterInput2], { nullable: true })
  OR?: AuditLogFilterInput2[]

  @Field(() => [AuditLogFilterInput2], { nullable: true })
  NOT?: AuditLogFilterInput2[]
}

@InputType()
export class CountryFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  alpha3?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  countryCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  iso3166_2?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  region?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegion?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  regionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subRegionCode?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  intermediateRegionCode?: StringFilterInput

  @Field(() => AddressListRelationFilterInput, { nullable: true })
  addresses?: AddressListRelationFilterInput

  @Field(() => [CountryFilterInput2], { nullable: true })
  AND?: CountryFilterInput2[]

  @Field(() => [CountryFilterInput2], { nullable: true })
  OR?: CountryFilterInput2[]

  @Field(() => [CountryFilterInput2], { nullable: true })
  NOT?: CountryFilterInput2[]
}

@InputType()
export class EmailFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  public?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  primary?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  verified?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  verifyExpires?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => EmailTypeFilterInput, { nullable: true })
  emailType?: EmailTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => [EmailFilterInput2], { nullable: true })
  AND?: EmailFilterInput2[]

  @Field(() => [EmailFilterInput2], { nullable: true })
  OR?: EmailFilterInput2[]

  @Field(() => [EmailFilterInput2], { nullable: true })
  NOT?: EmailFilterInput2[]
}

@InputType()
export class InviteFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  expiresAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  token?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  inviterId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  inviter?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => InviteStatusFilterInput, { nullable: true })
  status?: InviteStatusFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput

  @Field(() => RoleRelationFilterInput, { nullable: true })
  role?: RoleRelationFilterInput

  @Field(() => [InviteFilterInput2], { nullable: true })
  AND?: InviteFilterInput2[]

  @Field(() => [InviteFilterInput2], { nullable: true })
  OR?: InviteFilterInput2[]

  @Field(() => [InviteFilterInput2], { nullable: true })
  NOT?: InviteFilterInput2[]
}

@InputType()
export class LinkFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => [LinkFilterInput2], { nullable: true })
  AND?: LinkFilterInput2[]

  @Field(() => [LinkFilterInput2], { nullable: true })
  OR?: LinkFilterInput2[]

  @Field(() => [LinkFilterInput2], { nullable: true })
  NOT?: LinkFilterInput2[]
}

@InputType()
export class LoginAttemptFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  email?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  success?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userAgent?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  location?: StringFilterInput

  @Field(() => FailureReasonFilterInput, { nullable: true })
  reason?: FailureReasonFilterInput

  @Field(() => [LoginAttemptFilterInput2], { nullable: true })
  AND?: LoginAttemptFilterInput2[]

  @Field(() => [LoginAttemptFilterInput2], { nullable: true })
  OR?: LoginAttemptFilterInput2[]

  @Field(() => [LoginAttemptFilterInput2], { nullable: true })
  NOT?: LoginAttemptFilterInput2[]
}

@InputType()
export class OAuthAccountFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  provider?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerUserId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => [OAuthAccountFilterInput2], { nullable: true })
  AND?: OAuthAccountFilterInput2[]

  @Field(() => [OAuthAccountFilterInput2], { nullable: true })
  OR?: OAuthAccountFilterInput2[]

  @Field(() => [OAuthAccountFilterInput2], { nullable: true })
  NOT?: OAuthAccountFilterInput2[]
}

@InputType()
export class OrganizationFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  logoId?: StringFilterInput

  @Field(() => StoredFileRelationFilterInput, { nullable: true })
  logo?: StoredFileRelationFilterInput

  @Field(() => EmailListRelationFilterInput, { nullable: true })
  emails?: EmailListRelationFilterInput

  @Field(() => LinkListRelationFilterInput, { nullable: true })
  links?: LinkListRelationFilterInput

  @Field(() => PhoneNumberListRelationFilterInput, { nullable: true })
  phoneNumbers?: PhoneNumberListRelationFilterInput

  @Field(() => StoredFileListRelationFilterInput, { nullable: true })
  images?: StoredFileListRelationFilterInput

  @Field(() => OrganizationMemberListRelationFilterInput, { nullable: true })
  members?: OrganizationMemberListRelationFilterInput

  @Field(() => AddressListRelationFilterInput, { nullable: true })
  addresses?: AddressListRelationFilterInput

  @Field(() => InviteListRelationFilterInput, { nullable: true })
  invites?: InviteListRelationFilterInput

  @Field(() => AuditLogListRelationFilterInput, { nullable: true })
  AuditLog?: AuditLogListRelationFilterInput

  @Field(() => TeamListRelationFilterInput, { nullable: true })
  Team?: TeamListRelationFilterInput

  @Field(() => SubscriptionRelationFilterInput, { nullable: true })
  subscription?: SubscriptionRelationFilterInput

  @Field(() => RoleListRelationFilterInput, { nullable: true })
  roles?: RoleListRelationFilterInput

  @Field(() => ApiTokenListRelationFilterInput, { nullable: true })
  apiTokens?: ApiTokenListRelationFilterInput

  @Field(() => [OrganizationFilterInput2], { nullable: true })
  AND?: OrganizationFilterInput2[]

  @Field(() => [OrganizationFilterInput2], { nullable: true })
  OR?: OrganizationFilterInput2[]

  @Field(() => [OrganizationFilterInput2], { nullable: true })
  NOT?: OrganizationFilterInput2[]
}

@InputType()
export class OrganizationMemberFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput

  @Field(() => RoleRelationFilterInput, { nullable: true })
  role?: RoleRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => [OrganizationMemberFilterInput2], { nullable: true })
  AND?: OrganizationMemberFilterInput2[]

  @Field(() => [OrganizationMemberFilterInput2], { nullable: true })
  OR?: OrganizationMemberFilterInput2[]

  @Field(() => [OrganizationMemberFilterInput2], { nullable: true })
  NOT?: OrganizationMemberFilterInput2[]
}

@InputType()
export class PermissionFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  action?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  subject?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => RoleListRelationFilterInput, { nullable: true })
  roles?: RoleListRelationFilterInput

  @Field(() => [PermissionFilterInput2], { nullable: true })
  AND?: PermissionFilterInput2[]

  @Field(() => [PermissionFilterInput2], { nullable: true })
  OR?: PermissionFilterInput2[]

  @Field(() => [PermissionFilterInput2], { nullable: true })
  NOT?: PermissionFilterInput2[]
}

@InputType()
export class PhoneNumberFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  phone?: StringFilterInput

  @Field(() => PhoneTypeFilterInput, { nullable: true })
  phoneType?: PhoneTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  primary?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => [PhoneNumberFilterInput2], { nullable: true })
  AND?: PhoneNumberFilterInput2[]

  @Field(() => [PhoneNumberFilterInput2], { nullable: true })
  OR?: PhoneNumberFilterInput2[]

  @Field(() => [PhoneNumberFilterInput2], { nullable: true })
  NOT?: PhoneNumberFilterInput2[]
}

@InputType()
export class PlanFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => FloatFilterInput, { nullable: true })
  price?: FloatFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  interval?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  active?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeProductId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  trialPeriodDays?: IntFilterInput

  @Field(() => SubscriptionListRelationFilterInput, { nullable: true })
  subscriptions?: SubscriptionListRelationFilterInput

  @Field(() => [PlanFilterInput2], { nullable: true })
  AND?: PlanFilterInput2[]

  @Field(() => [PlanFilterInput2], { nullable: true })
  OR?: PlanFilterInput2[]

  @Field(() => [PlanFilterInput2], { nullable: true })
  NOT?: PlanFilterInput2[]
}

@InputType()
export class RoleFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => PermissionListRelationFilterInput, { nullable: true })
  permissions?: PermissionListRelationFilterInput

  @Field(() => OrganizationMemberListRelationFilterInput, { nullable: true })
  members?: OrganizationMemberListRelationFilterInput

  @Field(() => TeamMemberListRelationFilterInput, { nullable: true })
  teamMembers?: TeamMemberListRelationFilterInput

  @Field(() => InviteListRelationFilterInput, { nullable: true })
  invites?: InviteListRelationFilterInput

  @Field(() => [RoleFilterInput2], { nullable: true })
  AND?: RoleFilterInput2[]

  @Field(() => [RoleFilterInput2], { nullable: true })
  OR?: RoleFilterInput2[]

  @Field(() => [RoleFilterInput2], { nullable: true })
  NOT?: RoleFilterInput2[]
}

@InputType()
export class SecurityEventFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => SecurityEventTypeFilterInput, { nullable: true })
  eventType?: SecurityEventTypeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userAgent?: StringFilterInput

  @Field(() => [SecurityEventFilterInput2], { nullable: true })
  AND?: SecurityEventFilterInput2[]

  @Field(() => [SecurityEventFilterInput2], { nullable: true })
  OR?: SecurityEventFilterInput2[]

  @Field(() => [SecurityEventFilterInput2], { nullable: true })
  NOT?: SecurityEventFilterInput2[]
}

@InputType()
export class SubscriptionFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  planId?: StringFilterInput

  @Field(() => PlanRelationFilterInput, { nullable: true })
  plan?: PlanRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeCustomerId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripeSubscriptionId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  stripePriceId?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  stripeCurrentPeriodEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialStart?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  trialEnd?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  cancelAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  canceledAt?: DateTimeFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  cancelAtPeriodEnd?: BooleanFilterInput

  @Field(() => SubscriptionStatusFilterInput, { nullable: true })
  status?: SubscriptionStatusFilterInput

  @Field(() => [SubscriptionFilterInput2], { nullable: true })
  AND?: SubscriptionFilterInput2[]

  @Field(() => [SubscriptionFilterInput2], { nullable: true })
  OR?: SubscriptionFilterInput2[]

  @Field(() => [SubscriptionFilterInput2], { nullable: true })
  NOT?: SubscriptionFilterInput2[]
}

@InputType()
export class TeamFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  name?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  description?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => TeamMemberListRelationFilterInput, { nullable: true })
  members?: TeamMemberListRelationFilterInput

  @Field(() => [TeamFilterInput2], { nullable: true })
  AND?: TeamFilterInput2[]

  @Field(() => [TeamFilterInput2], { nullable: true })
  OR?: TeamFilterInput2[]

  @Field(() => [TeamFilterInput2], { nullable: true })
  NOT?: TeamFilterInput2[]
}

@InputType()
export class TeamMemberFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  teamId?: StringFilterInput

  @Field(() => TeamRelationFilterInput, { nullable: true })
  team?: TeamRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  roleId?: StringFilterInput

  @Field(() => RoleRelationFilterInput, { nullable: true })
  role?: RoleRelationFilterInput

  @Field(() => [TeamMemberFilterInput2], { nullable: true })
  AND?: TeamMemberFilterInput2[]

  @Field(() => [TeamMemberFilterInput2], { nullable: true })
  OR?: TeamMemberFilterInput2[]

  @Field(() => [TeamMemberFilterInput2], { nullable: true })
  NOT?: TeamMemberFilterInput2[]
}

@InputType()
export class StoredFileFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StorageProviderFilterInput, { nullable: true })
  provider?: StorageProviderFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  providerFileId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  folder?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  filename?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  originalName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  mimeType?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  size?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  url?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  publicUrl?: StringFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  width?: IntFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  height?: IntFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  organizationId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organization?: OrganizationRelationFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  userAvatar?: UserRelationFilterInput

  @Field(() => OrganizationRelationFilterInput, { nullable: true })
  organizationLogo?: OrganizationRelationFilterInput

  @Field(() => [StoredFileFilterInput2], { nullable: true })
  AND?: StoredFileFilterInput2[]

  @Field(() => [StoredFileFilterInput2], { nullable: true })
  OR?: StoredFileFilterInput2[]

  @Field(() => [StoredFileFilterInput2], { nullable: true })
  NOT?: StoredFileFilterInput2[]
}

@InputType()
export class UserFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  firstName?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  lastName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isSuperAdmin?: BooleanFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  bio?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  displayName?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  emailValidated?: BooleanFilterInput

  @Field(() => EmailListRelationFilterInput, { nullable: true })
  emails?: EmailListRelationFilterInput

  @Field(() => LinkListRelationFilterInput, { nullable: true })
  links?: LinkListRelationFilterInput

  @Field(() => PhoneNumberListRelationFilterInput, { nullable: true })
  phoneNumbers?: PhoneNumberListRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  avatarId?: StringFilterInput

  @Field(() => StoredFileRelationFilterInput, { nullable: true })
  avatar?: StoredFileRelationFilterInput

  @Field(() => StoredFileListRelationFilterInput, { nullable: true })
  images?: StoredFileListRelationFilterInput

  @Field(() => OrganizationMemberListRelationFilterInput, { nullable: true })
  organizations?: OrganizationMemberListRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  activeOrganizationId?: StringFilterInput

  @Field(() => AddressListRelationFilterInput, { nullable: true })
  addresses?: AddressListRelationFilterInput

  @Field(() => InviteListRelationFilterInput, { nullable: true })
  invitesSent?: InviteListRelationFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorEnabled?: BooleanFilterInput

  @Field(() => TwoFactorMethodFilterInput, { nullable: true })
  twoFactorMethod?: TwoFactorMethodFilterInput

  @Field(() => UserSessionListRelationFilterInput, { nullable: true })
  activeSessions?: UserSessionListRelationFilterInput

  @Field(() => LoginAttemptListRelationFilterInput, { nullable: true })
  loginAttempts?: LoginAttemptListRelationFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastSuccessfulLogin?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastFailedLogin?: DateTimeFilterInput

  @Field(() => IntFilterInput, { nullable: true })
  failedLoginCount?: IntFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lockedUntil?: DateTimeFilterInput

  @Field(() => AuditLogListRelationFilterInput, { nullable: true })
  AuditLog?: AuditLogListRelationFilterInput

  @Field(() => UserPreferenceListRelationFilterInput, { nullable: true })
  UserPreference?: UserPreferenceListRelationFilterInput

  @Field(() => TeamMemberListRelationFilterInput, { nullable: true })
  TeamMember?: TeamMemberListRelationFilterInput

  @Field(() => SecurityEventListRelationFilterInput, { nullable: true })
  SecurityEvent?: SecurityEventListRelationFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isActive?: BooleanFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  deactivatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  termsAcceptedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  privacyPolicyAcceptedAt?: DateTimeFilterInput

  @Field(() => ApiTokenListRelationFilterInput, { nullable: true })
  apiTokens?: ApiTokenListRelationFilterInput

  @Field(() => OAuthAccountListRelationFilterInput, { nullable: true })
  oAuthAccounts?: OAuthAccountListRelationFilterInput

  @Field(() => [UserFilterInput2], { nullable: true })
  AND?: UserFilterInput2[]

  @Field(() => [UserFilterInput2], { nullable: true })
  OR?: UserFilterInput2[]

  @Field(() => [UserFilterInput2], { nullable: true })
  NOT?: UserFilterInput2[]
}

@InputType()
export class UserPreferenceFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  key?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  value?: StringFilterInput

  @Field(() => [UserPreferenceFilterInput2], { nullable: true })
  AND?: UserPreferenceFilterInput2[]

  @Field(() => [UserPreferenceFilterInput2], { nullable: true })
  OR?: UserPreferenceFilterInput2[]

  @Field(() => [UserPreferenceFilterInput2], { nullable: true })
  NOT?: UserPreferenceFilterInput2[]
}

@InputType()
export class UserSessionFilterInput {
  [key: string]: unknown

  @Field(() => StringFilterInput, { nullable: true })
  id?: StringFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  createdAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  updatedAt?: DateTimeFilterInput

  @Field(() => DateTimeFilterInput, { nullable: true })
  lastActiveAt?: DateTimeFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  userId?: StringFilterInput

  @Field(() => UserRelationFilterInput, { nullable: true })
  user?: UserRelationFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  deviceInfo?: StringFilterInput

  @Field(() => StringFilterInput, { nullable: true })
  ipAddress?: StringFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  isValid?: BooleanFilterInput

  @Field(() => BooleanFilterInput, { nullable: true })
  twoFactorVerified?: BooleanFilterInput

  @Field(() => [UserSessionFilterInput2], { nullable: true })
  AND?: UserSessionFilterInput2[]

  @Field(() => [UserSessionFilterInput2], { nullable: true })
  OR?: UserSessionFilterInput2[]

  @Field(() => [UserSessionFilterInput2], { nullable: true })
  NOT?: UserSessionFilterInput2[]
}

@InputType()
export class CreateAddressInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  address1?: string

  @Field({ nullable: true })
  address2?: string

  @Field({ nullable: true })
  city?: string

  @Field({ nullable: true })
  region?: string

  @Field({ nullable: true })
  postalCode?: string

  @Field(() => AddressType, { nullable: true })
  addressType?: AddressType

  @Field({ nullable: true })
  isPrimary?: boolean

  @Field({ nullable: true })
  countryId?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class UpdateAddressInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  address1?: string

  @Field({ nullable: true })
  address2?: string

  @Field({ nullable: true })
  city?: string

  @Field({ nullable: true })
  region?: string

  @Field({ nullable: true })
  postalCode?: string

  @Field(() => AddressType, { nullable: true })
  addressType?: AddressType

  @Field({ nullable: true })
  isPrimary?: boolean

  @Field({ nullable: true })
  countryId?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class ListAddressInput extends CorePagingInput {
  @Field(() => AddressFilterInput, { nullable: true })
  filters?: AddressFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  address1?: string

  @Field({ nullable: true })
  address2?: string

  @Field({ nullable: true })
  city?: string

  @Field({ nullable: true })
  region?: string

  @Field({ nullable: true })
  postalCode?: string

  @Field(() => AddressType, { nullable: true })
  addressType?: AddressType

  @Field({ nullable: true })
  isPrimary?: boolean

  @Field({ nullable: true })
  countryId?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class CreateApiTokenInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  userId!: string

  @Field({ nullable: false })
  name!: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastUsedAt?: Date

  @Field({ nullable: true })
  revoked?: boolean

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class UpdateApiTokenInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  name?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastUsedAt?: Date

  @Field({ nullable: true })
  revoked?: boolean

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class ListApiTokenInput extends CorePagingInput {
  @Field(() => ApiTokenFilterInput, { nullable: true })
  filters?: ApiTokenFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  name?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastUsedAt?: Date

  @Field({ nullable: true })
  revoked?: boolean

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class CreateAuditLogInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  entityId!: string

  @Field({ nullable: false })
  entityType!: string

  @Field({ nullable: false })
  action!: string

  @Field({ nullable: false })
  userId!: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => GraphQLJSON, { nullable: true })
  changes?: typeof GraphQLJSON
}

@InputType()
export class UpdateAuditLogInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  entityId?: string

  @Field({ nullable: true })
  entityType?: string

  @Field({ nullable: true })
  action?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => GraphQLJSON, { nullable: true })
  changes?: typeof GraphQLJSON
}

@InputType()
export class ListAuditLogInput extends CorePagingInput {
  @Field(() => AuditLogFilterInput, { nullable: true })
  filters?: AuditLogFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  entityId?: string

  @Field({ nullable: true })
  entityType?: string

  @Field({ nullable: true })
  action?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => GraphQLJSON, { nullable: true })
  changes?: typeof GraphQLJSON
}

@InputType()
export class CreateCountryInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  name!: string

  @Field({ nullable: false })
  alpha2!: string

  @Field({ nullable: false })
  alpha3!: string

  @Field({ nullable: false })
  countryCode!: string

  @Field({ nullable: false })
  iso3166_2!: string

  @Field({ nullable: false })
  region!: string

  @Field({ nullable: false })
  subRegion!: string

  @Field({ nullable: false })
  intermediateRegion!: string

  @Field({ nullable: false })
  regionCode!: string

  @Field({ nullable: false })
  subRegionCode!: string

  @Field({ nullable: false })
  intermediateRegionCode!: string

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]
}

@InputType()
export class UpdateCountryInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  alpha2?: string

  @Field({ nullable: true })
  alpha3?: string

  @Field({ nullable: true })
  countryCode?: string

  @Field({ nullable: true })
  iso3166_2?: string

  @Field({ nullable: true })
  region?: string

  @Field({ nullable: true })
  subRegion?: string

  @Field({ nullable: true })
  intermediateRegion?: string

  @Field({ nullable: true })
  regionCode?: string

  @Field({ nullable: true })
  subRegionCode?: string

  @Field({ nullable: true })
  intermediateRegionCode?: string

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]
}

@InputType()
export class ListCountryInput extends CorePagingInput {
  @Field(() => CountryFilterInput, { nullable: true })
  filters?: CountryFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  alpha2?: string

  @Field({ nullable: true })
  alpha3?: string

  @Field({ nullable: true })
  countryCode?: string

  @Field({ nullable: true })
  iso3166_2?: string

  @Field({ nullable: true })
  region?: string

  @Field({ nullable: true })
  subRegion?: string

  @Field({ nullable: true })
  intermediateRegion?: string

  @Field({ nullable: true })
  regionCode?: string

  @Field({ nullable: true })
  subRegionCode?: string

  @Field({ nullable: true })
  intermediateRegionCode?: string

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]
}

@InputType()
export class CreateEmailInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  email!: string

  @Field({ nullable: true })
  public?: boolean

  @Field({ nullable: true })
  primary?: boolean

  @Field({ nullable: true })
  verified?: boolean

  @Field(() => GraphQLISODateTime, { nullable: true })
  verifyExpires?: Date

  @Field({ nullable: true })
  userId?: string

  @Field(() => EmailType, { nullable: true })
  emailType?: EmailType

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class UpdateEmailInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  public?: boolean

  @Field({ nullable: true })
  primary?: boolean

  @Field({ nullable: true })
  verified?: boolean

  @Field(() => GraphQLISODateTime, { nullable: true })
  verifyExpires?: Date

  @Field({ nullable: true })
  userId?: string

  @Field(() => EmailType, { nullable: true })
  emailType?: EmailType

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class ListEmailInput extends CorePagingInput {
  @Field(() => EmailFilterInput, { nullable: true })
  filters?: EmailFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  public?: boolean

  @Field({ nullable: true })
  primary?: boolean

  @Field({ nullable: true })
  verified?: boolean

  @Field(() => GraphQLISODateTime, { nullable: true })
  verifyExpires?: Date

  @Field({ nullable: true })
  userId?: string

  @Field(() => EmailType, { nullable: true })
  emailType?: EmailType

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class CreateInviteInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: false })
  expiresAt!: Date

  @Field({ nullable: false })
  email!: string

  @Field({ nullable: false })
  token!: string

  @Field({ nullable: false })
  inviterId!: string

  @Field({ nullable: false })
  organizationId!: string

  @Field(() => InviteStatus, { nullable: true })
  status?: InviteStatus

  @Field({ nullable: true })
  roleId?: string
}

@InputType()
export class UpdateInviteInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date

  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  token?: string

  @Field({ nullable: true })
  inviterId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => InviteStatus, { nullable: true })
  status?: InviteStatus

  @Field({ nullable: true })
  roleId?: string
}

@InputType()
export class ListInviteInput extends CorePagingInput {
  @Field(() => InviteFilterInput, { nullable: true })
  filters?: InviteFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date

  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  token?: string

  @Field({ nullable: true })
  inviterId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => InviteStatus, { nullable: true })
  status?: InviteStatus

  @Field({ nullable: true })
  roleId?: string
}

@InputType()
export class CreateLinkInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  name!: string

  @Field({ nullable: false })
  url!: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class UpdateLinkInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  url?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class ListLinkInput extends CorePagingInput {
  @Field(() => LinkFilterInput, { nullable: true })
  filters?: LinkFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  url?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class CreateLoginAttemptInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: false })
  email!: string

  @Field({ nullable: true })
  success?: boolean

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  userAgent?: string

  @Field({ nullable: true })
  location?: string

  @Field(() => FailureReason, { nullable: true })
  reason?: FailureReason
}

@InputType()
export class UpdateLoginAttemptInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  success?: boolean

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  userAgent?: string

  @Field({ nullable: true })
  location?: string

  @Field(() => FailureReason, { nullable: true })
  reason?: FailureReason
}

@InputType()
export class ListLoginAttemptInput extends CorePagingInput {
  @Field(() => LoginAttemptFilterInput, { nullable: true })
  filters?: LoginAttemptFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  success?: boolean

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  userAgent?: string

  @Field({ nullable: true })
  location?: string

  @Field(() => FailureReason, { nullable: true })
  reason?: FailureReason
}

@InputType()
export class CreateOAuthAccountInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  provider!: string

  @Field({ nullable: false })
  providerUserId!: string

  @Field({ nullable: false })
  userId!: string
}

@InputType()
export class UpdateOAuthAccountInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  provider?: string

  @Field({ nullable: true })
  providerUserId?: string

  @Field({ nullable: true })
  userId?: string
}

@InputType()
export class ListOAuthAccountInput extends CorePagingInput {
  @Field(() => OAuthAccountFilterInput, { nullable: true })
  filters?: OAuthAccountFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  provider?: string

  @Field({ nullable: true })
  providerUserId?: string

  @Field({ nullable: true })
  userId?: string
}

@InputType()
export class CreateOrganizationInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  name!: string

  @Field({ nullable: true })
  logoId?: string

  @Field(() => [String], { nullable: true })
  emailsIds?: string[]

  @Field(() => [String], { nullable: true })
  linksIds?: string[]

  @Field(() => [String], { nullable: true })
  phoneNumbersIds?: string[]

  @Field(() => [String], { nullable: true })
  imagesIds?: string[]

  @Field(() => [String], { nullable: true })
  membersIds?: string[]

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesIds?: string[]

  @Field(() => [String], { nullable: true })
  AuditLogIds?: string[]

  @Field(() => [String], { nullable: true })
  TeamIds?: string[]

  @Field({ nullable: true })
  subscriptionId?: string

  @Field(() => [String], { nullable: true })
  rolesIds?: string[]

  @Field(() => [String], { nullable: true })
  apiTokensIds?: string[]
}

@InputType()
export class UpdateOrganizationInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  logoId?: string

  @Field(() => [String], { nullable: true })
  emailsIds?: string[]

  @Field(() => [String], { nullable: true })
  linksIds?: string[]

  @Field(() => [String], { nullable: true })
  phoneNumbersIds?: string[]

  @Field(() => [String], { nullable: true })
  imagesIds?: string[]

  @Field(() => [String], { nullable: true })
  membersIds?: string[]

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesIds?: string[]

  @Field(() => [String], { nullable: true })
  AuditLogIds?: string[]

  @Field(() => [String], { nullable: true })
  TeamIds?: string[]

  @Field({ nullable: true })
  subscriptionId?: string

  @Field(() => [String], { nullable: true })
  rolesIds?: string[]

  @Field(() => [String], { nullable: true })
  apiTokensIds?: string[]
}

@InputType()
export class ListOrganizationInput extends CorePagingInput {
  @Field(() => OrganizationFilterInput, { nullable: true })
  filters?: OrganizationFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  logoId?: string

  @Field(() => [String], { nullable: true })
  emailsIds?: string[]

  @Field(() => [String], { nullable: true })
  linksIds?: string[]

  @Field(() => [String], { nullable: true })
  phoneNumbersIds?: string[]

  @Field(() => [String], { nullable: true })
  imagesIds?: string[]

  @Field(() => [String], { nullable: true })
  membersIds?: string[]

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesIds?: string[]

  @Field(() => [String], { nullable: true })
  AuditLogIds?: string[]

  @Field(() => [String], { nullable: true })
  TeamIds?: string[]

  @Field({ nullable: true })
  subscriptionId?: string

  @Field(() => [String], { nullable: true })
  rolesIds?: string[]

  @Field(() => [String], { nullable: true })
  apiTokensIds?: string[]
}

@InputType()
export class CreateOrganizationMemberInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  roleId!: string

  @Field({ nullable: false })
  userId!: string

  @Field({ nullable: false })
  organizationId!: string
}

@InputType()
export class UpdateOrganizationMemberInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  roleId?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class ListOrganizationMemberInput extends CorePagingInput {
  @Field(() => OrganizationMemberFilterInput, { nullable: true })
  filters?: OrganizationMemberFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  roleId?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class CreatePermissionInput {
  @Field({ nullable: true })
  id?: string

  @Field({ nullable: false })
  action!: string

  @Field({ nullable: false })
  subject!: string

  @Field({ nullable: true })
  description?: string

  @Field(() => [String], { nullable: true })
  rolesIds?: string[]
}

@InputType()
export class UpdatePermissionInput {
  @Field({ nullable: true })
  id?: string

  @Field({ nullable: true })
  action?: string

  @Field({ nullable: true })
  subject?: string

  @Field({ nullable: true })
  description?: string

  @Field(() => [String], { nullable: true })
  rolesIds?: string[]
}

@InputType()
export class ListPermissionInput extends CorePagingInput {
  @Field(() => PermissionFilterInput, { nullable: true })
  filters?: PermissionFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field({ nullable: true })
  action?: string

  @Field({ nullable: true })
  subject?: string

  @Field({ nullable: true })
  description?: string

  @Field(() => [String], { nullable: true })
  rolesIds?: string[]
}

@InputType()
export class CreatePhoneNumberInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  phone!: string

  @Field(() => PhoneType, { nullable: true })
  phoneType?: PhoneType

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  primary?: boolean

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class UpdatePhoneNumberInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  phone?: string

  @Field(() => PhoneType, { nullable: true })
  phoneType?: PhoneType

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  primary?: boolean

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class ListPhoneNumberInput extends CorePagingInput {
  @Field(() => PhoneNumberFilterInput, { nullable: true })
  filters?: PhoneNumberFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  phone?: string

  @Field(() => PhoneType, { nullable: true })
  phoneType?: PhoneType

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  primary?: boolean

  @Field({ nullable: true })
  organizationId?: string
}

@InputType()
export class CreatePlanInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  name!: string

  @Field({ nullable: true })
  description?: string

  @Field(() => Float, { nullable: false })
  price!: number

  @Field({ nullable: false })
  interval!: string

  @Field(() => GraphQLJSON, { nullable: true })
  features?: typeof GraphQLJSON

  @Field(() => GraphQLJSON, { nullable: true })
  limits?: typeof GraphQLJSON

  @Field({ nullable: true })
  active?: boolean

  @Field({ nullable: true })
  stripeProductId?: string

  @Field({ nullable: true })
  stripePriceId?: string

  @Field(() => Int, { nullable: true })
  trialPeriodDays?: number

  @Field(() => [String], { nullable: true })
  subscriptionsIds?: string[]
}

@InputType()
export class UpdatePlanInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  description?: string

  @Field(() => Float, { nullable: true })
  price?: number

  @Field({ nullable: true })
  interval?: string

  @Field(() => GraphQLJSON, { nullable: true })
  features?: typeof GraphQLJSON

  @Field(() => GraphQLJSON, { nullable: true })
  limits?: typeof GraphQLJSON

  @Field({ nullable: true })
  active?: boolean

  @Field({ nullable: true })
  stripeProductId?: string

  @Field({ nullable: true })
  stripePriceId?: string

  @Field(() => Int, { nullable: true })
  trialPeriodDays?: number

  @Field(() => [String], { nullable: true })
  subscriptionsIds?: string[]
}

@InputType()
export class ListPlanInput extends CorePagingInput {
  @Field(() => PlanFilterInput, { nullable: true })
  filters?: PlanFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  description?: string

  @Field(() => Float, { nullable: true })
  price?: number

  @Field({ nullable: true })
  interval?: string

  @Field(() => GraphQLJSON, { nullable: true })
  features?: typeof GraphQLJSON

  @Field(() => GraphQLJSON, { nullable: true })
  limits?: typeof GraphQLJSON

  @Field({ nullable: true })
  active?: boolean

  @Field({ nullable: true })
  stripeProductId?: string

  @Field({ nullable: true })
  stripePriceId?: string

  @Field(() => Int, { nullable: true })
  trialPeriodDays?: number

  @Field(() => [String], { nullable: true })
  subscriptionsIds?: string[]
}

@InputType()
export class CreateRoleInput {
  @Field({ nullable: true })
  id?: string

  @Field({ nullable: false })
  name!: string

  @Field({ nullable: true })
  description?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => [String], { nullable: true })
  permissionsIds?: string[]

  @Field(() => [String], { nullable: true })
  membersIds?: string[]

  @Field(() => [String], { nullable: true })
  teamMembersIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesIds?: string[]
}

@InputType()
export class UpdateRoleInput {
  @Field({ nullable: true })
  id?: string

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  description?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => [String], { nullable: true })
  permissionsIds?: string[]

  @Field(() => [String], { nullable: true })
  membersIds?: string[]

  @Field(() => [String], { nullable: true })
  teamMembersIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesIds?: string[]
}

@InputType()
export class ListRoleInput extends CorePagingInput {
  @Field(() => RoleFilterInput, { nullable: true })
  filters?: RoleFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  description?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => [String], { nullable: true })
  permissionsIds?: string[]

  @Field(() => [String], { nullable: true })
  membersIds?: string[]

  @Field(() => [String], { nullable: true })
  teamMembersIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesIds?: string[]
}

@InputType()
export class CreateSecurityEventInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  userId!: string

  @Field(() => SecurityEventType, { nullable: false })
  eventType!: SecurityEventType

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  userAgent?: string

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: typeof GraphQLJSON
}

@InputType()
export class UpdateSecurityEventInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field(() => SecurityEventType, { nullable: true })
  eventType?: SecurityEventType

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  userAgent?: string

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: typeof GraphQLJSON
}

@InputType()
export class ListSecurityEventInput extends CorePagingInput {
  @Field(() => SecurityEventFilterInput, { nullable: true })
  filters?: SecurityEventFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field(() => SecurityEventType, { nullable: true })
  eventType?: SecurityEventType

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  userAgent?: string

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: typeof GraphQLJSON
}

@InputType()
export class CreateSubscriptionInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  organizationId!: string

  @Field({ nullable: false })
  planId!: string

  @Field({ nullable: true })
  stripeCustomerId?: string

  @Field({ nullable: true })
  stripeSubscriptionId?: string

  @Field({ nullable: true })
  stripePriceId?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  stripeCurrentPeriodEnd?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialStart?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialEnd?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  cancelAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  canceledAt?: Date

  @Field({ nullable: true })
  cancelAtPeriodEnd?: boolean

  @Field(() => SubscriptionStatus, { nullable: true })
  status?: SubscriptionStatus
}

@InputType()
export class UpdateSubscriptionInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  planId?: string

  @Field({ nullable: true })
  stripeCustomerId?: string

  @Field({ nullable: true })
  stripeSubscriptionId?: string

  @Field({ nullable: true })
  stripePriceId?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  stripeCurrentPeriodEnd?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialStart?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialEnd?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  cancelAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  canceledAt?: Date

  @Field({ nullable: true })
  cancelAtPeriodEnd?: boolean

  @Field(() => SubscriptionStatus, { nullable: true })
  status?: SubscriptionStatus
}

@InputType()
export class ListSubscriptionInput extends CorePagingInput {
  @Field(() => SubscriptionFilterInput, { nullable: true })
  filters?: SubscriptionFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  planId?: string

  @Field({ nullable: true })
  stripeCustomerId?: string

  @Field({ nullable: true })
  stripeSubscriptionId?: string

  @Field({ nullable: true })
  stripePriceId?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  stripeCurrentPeriodEnd?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialStart?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  trialEnd?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  cancelAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  canceledAt?: Date

  @Field({ nullable: true })
  cancelAtPeriodEnd?: boolean

  @Field(() => SubscriptionStatus, { nullable: true })
  status?: SubscriptionStatus
}

@InputType()
export class CreateTeamInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  name!: string

  @Field({ nullable: true })
  description?: string

  @Field({ nullable: false })
  organizationId!: string

  @Field(() => [String], { nullable: true })
  membersIds?: string[]
}

@InputType()
export class UpdateTeamInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  description?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => [String], { nullable: true })
  membersIds?: string[]
}

@InputType()
export class ListTeamInput extends CorePagingInput {
  @Field(() => TeamFilterInput, { nullable: true })
  filters?: TeamFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  description?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field(() => [String], { nullable: true })
  membersIds?: string[]
}

@InputType()
export class CreateTeamMemberInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  teamId!: string

  @Field({ nullable: false })
  userId!: string

  @Field({ nullable: false })
  roleId!: string
}

@InputType()
export class UpdateTeamMemberInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  teamId?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  roleId?: string
}

@InputType()
export class ListTeamMemberInput extends CorePagingInput {
  @Field(() => TeamMemberFilterInput, { nullable: true })
  filters?: TeamMemberFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  teamId?: string

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  roleId?: string
}

@InputType()
export class CreateStoredFileInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => StorageProvider, { nullable: false })
  provider!: StorageProvider

  @Field({ nullable: false })
  providerFileId!: string

  @Field({ nullable: true })
  folder?: string

  @Field({ nullable: false })
  filename!: string

  @Field({ nullable: false })
  originalName!: string

  @Field({ nullable: false })
  mimeType!: string

  @Field(() => Int, { nullable: false })
  size!: number

  @Field({ nullable: false })
  url!: string

  @Field({ nullable: true })
  publicUrl?: string

  @Field(() => Int, { nullable: true })
  width?: number

  @Field(() => Int, { nullable: true })
  height?: number

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: typeof GraphQLJSON

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  userAvatarId?: string

  @Field({ nullable: true })
  organizationLogoId?: string
}

@InputType()
export class UpdateStoredFileInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => StorageProvider, { nullable: true })
  provider?: StorageProvider

  @Field({ nullable: true })
  providerFileId?: string

  @Field({ nullable: true })
  folder?: string

  @Field({ nullable: true })
  filename?: string

  @Field({ nullable: true })
  originalName?: string

  @Field({ nullable: true })
  mimeType?: string

  @Field(() => Int, { nullable: true })
  size?: number

  @Field({ nullable: true })
  url?: string

  @Field({ nullable: true })
  publicUrl?: string

  @Field(() => Int, { nullable: true })
  width?: number

  @Field(() => Int, { nullable: true })
  height?: number

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: typeof GraphQLJSON

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  userAvatarId?: string

  @Field({ nullable: true })
  organizationLogoId?: string
}

@InputType()
export class ListStoredFileInput extends CorePagingInput {
  @Field(() => StoredFileFilterInput, { nullable: true })
  filters?: StoredFileFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => StorageProvider, { nullable: true })
  provider?: StorageProvider

  @Field({ nullable: true })
  providerFileId?: string

  @Field({ nullable: true })
  folder?: string

  @Field({ nullable: true })
  filename?: string

  @Field({ nullable: true })
  originalName?: string

  @Field({ nullable: true })
  mimeType?: string

  @Field(() => Int, { nullable: true })
  size?: number

  @Field({ nullable: true })
  url?: string

  @Field({ nullable: true })
  publicUrl?: string

  @Field(() => Int, { nullable: true })
  width?: number

  @Field(() => Int, { nullable: true })
  height?: number

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: typeof GraphQLJSON

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  organizationId?: string

  @Field({ nullable: true })
  userAvatarId?: string

  @Field({ nullable: true })
  organizationLogoId?: string
}

@InputType()
export class CreateUserInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  firstName?: string

  @Field({ nullable: true })
  lastName?: string

  @Field({ nullable: true })
  isSuperAdmin?: boolean

  @Field({ nullable: true })
  bio?: string

  @Field({ nullable: true })
  displayName?: string

  @Field({ nullable: true })
  emailValidated?: boolean

  @Field({ nullable: true })
  avatarId?: string

  @Field({ nullable: true })
  activeOrganizationId?: string

  @Field({ nullable: true })
  twoFactorEnabled?: boolean

  @Field(() => TwoFactorMethod, { nullable: true })
  twoFactorMethod?: TwoFactorMethod

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastSuccessfulLogin?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastFailedLogin?: Date

  @Field(() => Int, { nullable: true })
  failedLoginCount?: number

  @Field(() => GraphQLISODateTime, { nullable: true })
  lockedUntil?: Date

  @Field({ nullable: true })
  isActive?: boolean

  @Field(() => GraphQLISODateTime, { nullable: true })
  deactivatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  termsAcceptedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  privacyPolicyAcceptedAt?: Date

  @Field(() => [String], { nullable: true })
  emailsIds?: string[]

  @Field(() => [String], { nullable: true })
  linksIds?: string[]

  @Field(() => [String], { nullable: true })
  phoneNumbersIds?: string[]

  @Field(() => [String], { nullable: true })
  imagesIds?: string[]

  @Field(() => [String], { nullable: true })
  organizationsIds?: string[]

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesSentIds?: string[]

  @Field(() => [String], { nullable: true })
  activeSessionsIds?: string[]

  @Field(() => [String], { nullable: true })
  loginAttemptsIds?: string[]

  @Field(() => [String], { nullable: true })
  AuditLogIds?: string[]

  @Field(() => [String], { nullable: true })
  UserPreferenceIds?: string[]

  @Field(() => [String], { nullable: true })
  TeamMemberIds?: string[]

  @Field(() => [String], { nullable: true })
  SecurityEventIds?: string[]

  @Field(() => [String], { nullable: true })
  apiTokensIds?: string[]

  @Field(() => [String], { nullable: true })
  oAuthAccountsIds?: string[]
}

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  firstName?: string

  @Field({ nullable: true })
  lastName?: string

  @Field({ nullable: true })
  isSuperAdmin?: boolean

  @Field({ nullable: true })
  bio?: string

  @Field({ nullable: true })
  displayName?: string

  @Field({ nullable: true })
  emailValidated?: boolean

  @Field({ nullable: true })
  avatarId?: string

  @Field({ nullable: true })
  activeOrganizationId?: string

  @Field({ nullable: true })
  twoFactorEnabled?: boolean

  @Field(() => TwoFactorMethod, { nullable: true })
  twoFactorMethod?: TwoFactorMethod

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastSuccessfulLogin?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastFailedLogin?: Date

  @Field(() => Int, { nullable: true })
  failedLoginCount?: number

  @Field(() => GraphQLISODateTime, { nullable: true })
  lockedUntil?: Date

  @Field({ nullable: true })
  isActive?: boolean

  @Field(() => GraphQLISODateTime, { nullable: true })
  deactivatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  termsAcceptedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  privacyPolicyAcceptedAt?: Date

  @Field(() => [String], { nullable: true })
  emailsIds?: string[]

  @Field(() => [String], { nullable: true })
  linksIds?: string[]

  @Field(() => [String], { nullable: true })
  phoneNumbersIds?: string[]

  @Field(() => [String], { nullable: true })
  imagesIds?: string[]

  @Field(() => [String], { nullable: true })
  organizationsIds?: string[]

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesSentIds?: string[]

  @Field(() => [String], { nullable: true })
  activeSessionsIds?: string[]

  @Field(() => [String], { nullable: true })
  loginAttemptsIds?: string[]

  @Field(() => [String], { nullable: true })
  AuditLogIds?: string[]

  @Field(() => [String], { nullable: true })
  UserPreferenceIds?: string[]

  @Field(() => [String], { nullable: true })
  TeamMemberIds?: string[]

  @Field(() => [String], { nullable: true })
  SecurityEventIds?: string[]

  @Field(() => [String], { nullable: true })
  apiTokensIds?: string[]

  @Field(() => [String], { nullable: true })
  oAuthAccountsIds?: string[]
}

@InputType()
export class ListUserInput extends CorePagingInput {
  @Field(() => UserFilterInput, { nullable: true })
  filters?: UserFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  firstName?: string

  @Field({ nullable: true })
  lastName?: string

  @Field({ nullable: true })
  isSuperAdmin?: boolean

  @Field({ nullable: true })
  bio?: string

  @Field({ nullable: true })
  displayName?: string

  @Field({ nullable: true })
  emailValidated?: boolean

  @Field({ nullable: true })
  avatarId?: string

  @Field({ nullable: true })
  activeOrganizationId?: string

  @Field({ nullable: true })
  twoFactorEnabled?: boolean

  @Field(() => TwoFactorMethod, { nullable: true })
  twoFactorMethod?: TwoFactorMethod

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastSuccessfulLogin?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastFailedLogin?: Date

  @Field(() => Int, { nullable: true })
  failedLoginCount?: number

  @Field(() => GraphQLISODateTime, { nullable: true })
  lockedUntil?: Date

  @Field({ nullable: true })
  isActive?: boolean

  @Field(() => GraphQLISODateTime, { nullable: true })
  deactivatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  termsAcceptedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  privacyPolicyAcceptedAt?: Date

  @Field(() => [String], { nullable: true })
  emailsIds?: string[]

  @Field(() => [String], { nullable: true })
  linksIds?: string[]

  @Field(() => [String], { nullable: true })
  phoneNumbersIds?: string[]

  @Field(() => [String], { nullable: true })
  imagesIds?: string[]

  @Field(() => [String], { nullable: true })
  organizationsIds?: string[]

  @Field(() => [String], { nullable: true })
  addressesIds?: string[]

  @Field(() => [String], { nullable: true })
  invitesSentIds?: string[]

  @Field(() => [String], { nullable: true })
  activeSessionsIds?: string[]

  @Field(() => [String], { nullable: true })
  loginAttemptsIds?: string[]

  @Field(() => [String], { nullable: true })
  AuditLogIds?: string[]

  @Field(() => [String], { nullable: true })
  UserPreferenceIds?: string[]

  @Field(() => [String], { nullable: true })
  TeamMemberIds?: string[]

  @Field(() => [String], { nullable: true })
  SecurityEventIds?: string[]

  @Field(() => [String], { nullable: true })
  apiTokensIds?: string[]

  @Field(() => [String], { nullable: true })
  oAuthAccountsIds?: string[]
}

@InputType()
export class CreateUserPreferenceInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: false })
  userId!: string

  @Field({ nullable: false })
  key!: string

  @Field({ nullable: false })
  value!: string
}

@InputType()
export class UpdateUserPreferenceInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  key?: string

  @Field({ nullable: true })
  value?: string
}

@InputType()
export class ListUserPreferenceInput extends CorePagingInput {
  @Field(() => UserPreferenceFilterInput, { nullable: true })
  filters?: UserPreferenceFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  key?: string

  @Field({ nullable: true })
  value?: string
}

@InputType()
export class CreateUserSessionInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastActiveAt?: Date

  @Field({ nullable: false })
  userId!: string

  @Field({ nullable: true })
  deviceInfo?: string

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  isValid?: boolean

  @Field({ nullable: true })
  twoFactorVerified?: boolean
}

@InputType()
export class UpdateUserSessionInput {
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastActiveAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  deviceInfo?: string

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  isValid?: boolean

  @Field({ nullable: true })
  twoFactorVerified?: boolean
}

@InputType()
export class ListUserSessionInput extends CorePagingInput {
  @Field(() => UserSessionFilterInput, { nullable: true })
  filters?: UserSessionFilterInput = undefined

  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastActiveAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  deviceInfo?: string

  @Field({ nullable: true })
  ipAddress?: string

  @Field({ nullable: true })
  isValid?: boolean

  @Field({ nullable: true })
  twoFactorVerified?: boolean
}
