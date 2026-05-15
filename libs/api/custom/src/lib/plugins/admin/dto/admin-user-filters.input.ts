import { Field, InputType } from '@nestjs/graphql'

@InputType()
export class AdminUserFiltersInput {
  @Field(() => String, { nullable: true })
  search?: string // Search by email, name, or ID

  @Field(() => String, { nullable: true })
  organizationId?: string // Filter by organization

  @Field(() => Boolean, { nullable: true })
  isSuperAdmin?: boolean // Filter by super admin status

  @Field(() => Boolean, { nullable: true })
  emailVerified?: boolean // Filter by email verification status

  @Field(() => Boolean, { nullable: true })
  twoFactorEnabled?: boolean // Filter by 2FA status

  @Field(() => Boolean, { nullable: true })
  accountLocked?: boolean // Filter by account lock status

  @Field(() => Date, { nullable: true })
  registeredAfter?: Date // Filter by registration date

  @Field(() => Date, { nullable: true })
  registeredBefore?: Date // Filter by registration date

  @Field(() => Date, { nullable: true })
  lastLoginAfter?: Date // Filter by last login

  @Field(() => Date, { nullable: true })
  lastLoginBefore?: Date // Filter by last login

  @Field(() => Number, { nullable: true, defaultValue: 0 })
  skip?: number // Pagination skip

  @Field(() => Number, { nullable: true, defaultValue: 50 })
  take?: number // Pagination limit

  @Field(() => String, { nullable: true, defaultValue: 'createdAt' })
  sortBy?: string // Sort field

  @Field(() => String, { nullable: true, defaultValue: 'desc' })
  sortOrder?: string // Sort direction: 'asc' | 'desc'
}
