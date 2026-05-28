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
  tokenHash!: string

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
  tokenHash?: string

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
  @Field({ nullable: true })
  id?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt?: Date

  @Field(() => GraphQLISODateTime, { nullable: true })
  updatedAt?: Date

  @Field({ nullable: true })
  userId?: string

  @Field({ nullable: true })
  tokenHash?: string

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

  @Field({ nullable: true })
  verifyToken?: string

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

  @Field({ nullable: true })
  verifyToken?: string

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

  @Field({ nullable: true })
  verifyToken?: string

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
  password?: string

  @Field({ nullable: true })
  passwordResetToken?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  passwordResetExpires?: Date

  @Field({ nullable: true })
  emailValidated?: boolean

  @Field({ nullable: true })
  validateEmailToken?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  validateEmailTokenExpires?: Date

  @Field({ nullable: true })
  avatarId?: string

  @Field({ nullable: true })
  activeOrganizationId?: string

  @Field({ nullable: true })
  twoFactorEnabled?: boolean

  @Field({ nullable: true })
  twoFactorSecret?: string

  @Field(() => [String], { nullable: false })
  twoFactorRecoveryCodes!: string[]

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
  password?: string

  @Field({ nullable: true })
  passwordResetToken?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  passwordResetExpires?: Date

  @Field({ nullable: true })
  emailValidated?: boolean

  @Field({ nullable: true })
  validateEmailToken?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  validateEmailTokenExpires?: Date

  @Field({ nullable: true })
  avatarId?: string

  @Field({ nullable: true })
  activeOrganizationId?: string

  @Field({ nullable: true })
  twoFactorEnabled?: boolean

  @Field({ nullable: true })
  twoFactorSecret?: string

  @Field(() => [String], { nullable: true })
  twoFactorRecoveryCodes?: string[]

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
  password?: string

  @Field({ nullable: true })
  passwordResetToken?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  passwordResetExpires?: Date

  @Field({ nullable: true })
  emailValidated?: boolean

  @Field({ nullable: true })
  validateEmailToken?: string

  @Field(() => GraphQLISODateTime, { nullable: true })
  validateEmailTokenExpires?: Date

  @Field({ nullable: true })
  avatarId?: string

  @Field({ nullable: true })
  activeOrganizationId?: string

  @Field({ nullable: true })
  twoFactorEnabled?: boolean

  @Field({ nullable: true })
  twoFactorSecret?: string

  @Field(() => [String], { nullable: true })
  twoFactorRecoveryCodes?: string[]

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
