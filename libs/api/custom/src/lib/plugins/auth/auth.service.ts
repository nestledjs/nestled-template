import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { EmailType, User } from '@nestled-template/api/core/models'
import {
  ChangePasswordInput,
  EmulateUserInput,
  LoginInput,
  RegisterInput,
  RegisterWithInvitationInput,
  UserCreateInput,
  Disable2FAInput,
  Enable2FAOutput,
  Setup2FAOutput,
  UserSessionOutput,
} from './dto'
import { CookieOptions, Response } from 'express'
import {
  PrismaClientKnownRequestError,
  defaultPermissions,
  defaultRoles,
} from '@nestled-template/api/prisma'
import { UserToken } from './models'
import { EmailService } from '@nestled-template/api/integrations'
import {
  generateExpireDate,
  generateToken,
  generateUsernameSlug,
  generateUsernameWithSuffix,
  hashPassword,
  validatePassword,
} from './auth.helper'
import { ConfigService } from '@nestjs/config'
import { randomInt } from 'node:crypto'
import { SecurityEventsService } from '../security'
import { SessionService, SessionInfo } from './session.service'
import {
  generate2FASecret,
  verify2FACode,
  generateQRCode,
  generateBackupCodes,
  encryptSecret,
  decryptSecret,
  hashBackupCode,
} from './twofa.helper'

const authUserRelations = {
  emails: true,
  phoneNumbers: true,
  avatar: true,
  images: true,
} as const

@Injectable()
export class AuthService {
  constructor(
    private readonly data: ApiCoreDataAccessService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly securityEvents: SecurityEventsService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Adds a delay to slow down brute force attacks
   * Random delay between 100-200ms makes timing attacks harder
   */
  private async addBruteForceDelay(): Promise<void> {
    const delay = randomInt(100, 201)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  /**
   * Determines if user should be granted super admin privileges
   * First user to register in an empty database becomes super admin
   */
  private async shouldBecomeSuperAdmin(email: string): Promise<boolean> {
    const userCount = await this.data.user.count()

    if (userCount === 0) {
      const cleanEmail = email?.trim()?.toLowerCase()
      Logger.warn(`🔐 First user registration - granting super admin privileges: ${cleanEmail}`)
      return true
    }

    return false
  }

  async createUser(input: UserCreateInput) {
    const password = input.password
    const hashedPassword = hashPassword(password)
    const email = input?.email?.trim()?.toLowerCase()
    const isSuperAdmin = await this.shouldBecomeSuperAdmin(email)

    // Generate unique displayName (username)
    let displayName = generateUsernameSlug(input.firstName, input.lastName)

    // Check if username already exists, add suffix if needed
    const existingUser = await this.data.user.findUnique({
      where: { displayName },
    })

    if (existingUser) {
      // Keep trying with random suffixes until we find a unique one
      let attempts = 0
      const maxAttempts = 10
      while (attempts < maxAttempts) {
        displayName = generateUsernameWithSuffix(
          generateUsernameSlug(input.firstName, input.lastName),
        )
        const check = await this.data.user.findUnique({ where: { displayName } })
        if (!check) break
        attempts++
      }

      if (attempts >= maxAttempts) {
        throw new BadRequestException('Unable to generate unique username. Please try again.')
      }
    }

    const user = await this.data.user
      .create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          displayName,
          password: hashedPassword,
          isSuperAdmin,
          emails: {
            create: {
              email,
              primary: true,
              verified: false,
              emailType: EmailType.WORK,
            },
          },
        },
      })
      .catch(e => {
        if (e instanceof PrismaClientKnownRequestError) {
          if (e.code === 'P2002') {
            const target = e.meta?.['target'] as string[] | string | undefined
            const targetStr = Array.isArray(target) ? target.join(',') : target || ''
            if (targetStr.includes('email')) {
              throw new BadRequestException('This email is already in use')
            } else if (targetStr.includes('displayName')) {
              throw new BadRequestException('This username is already in use')
            }
            throw new BadRequestException('This information is already in use')
          }
        }
        throw e
      })

    // Save initial password to history
    if (user) {
      await this.data.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: hashedPassword,
        },
      })
    }

    return user
  }

  /**
   * Creates default roles for a new organization with proper permissions
   */
  private async createOrganizationRoles(organizationId: string) {
    // Ensure global permissions exist (idempotent — safe to call on a fresh DB)
    for (const perm of defaultPermissions) {
      await this.data.permission.upsert({
        where: { action_subject: { action: perm.action, subject: perm.subject } },
        update: {},
        create: perm,
      })
    }

    const allPermissions = await this.data.permission.findMany()

    for (const roleTemplate of defaultRoles) {
      const rolePermissions = allPermissions.filter(p =>
        roleTemplate.permissions.includes(`${p.subject}:${p.action}`),
      )

      await this.data.role.create({
        data: {
          name: roleTemplate.name,
          description: roleTemplate.description,
          organizationId,
          permissions: {
            connect: rolePermissions.map(p => ({ id: p.id })),
          },
        },
      })
    }
  }

  async register(payload: RegisterInput, sessionInfo?: SessionInfo) {
    const user = await this.createUser({
      ...payload,
    })

    if (user) {
      const primaryEmail = payload.email?.trim()?.toLowerCase()

      // Create default organization for the user
      const trimmedOrgName = payload.organizationName?.trim()
      const orgName =
        trimmedOrgName && trimmedOrgName.length > 0
          ? trimmedOrgName
          : `${user.firstName}'s Organization`
      const organization = await this.data.organization.create({
        data: { name: orgName },
      })

      // Create default roles for the organization
      await this.createOrganizationRoles(organization.id)

      // Get the "Owner" role we just created
      const ownerRole = await this.data.role.findFirst({
        where: {
          name: 'Owner',
          organizationId: organization.id,
        },
      })

      if (!ownerRole) {
        throw new Error('Failed to create Owner role for organization')
      }

      // Add user as owner of the organization
      await this.data.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: ownerRole.id,
        },
      })

      // Set as active organization
      await this.data.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: organization.id },
      })

      // Send verification email
      const validateEmailToken = generateToken()
      const validateEmailTokenExpires = generateExpireDate()
      await this.data.user.update({
        where: { id: user.id },
        data: { validateEmailToken, validateEmailTokenExpires },
      })
      const appName = this.config.get('app.name')
      const siteUrl = this.config.get('siteUrl')
      const verificationUrl = `${siteUrl}/verify-email?token=${validateEmailToken}&type=initial`

      await this.emailService.sendTemplate(primaryEmail, {
        templateId: 'email-verification',
        variables: {
          userName: user?.firstName || 'there',
          verificationUrl,
          appName,
          expirationHours: 24,
        },
      })

      Logger.log(
        `✓ User registered: ${primaryEmail} (SuperAdmin: ${user.isSuperAdmin}, Org: ${organization.name})`,
      )

      return this.signUser(user, false, undefined, sessionInfo)
    }
    return null
  }

  /**
   * Register a new user via invitation (does not create an organization)
   */
  async registerWithInvitation(payload: RegisterWithInvitationInput, sessionInfo?: SessionInfo) {
    // First, verify the invitation exists and is valid
    const invite = await this.data.invite.findUnique({
      where: { token: payload.invitationToken },
      include: { organization: true, role: true },
    })

    if (!invite) {
      throw new BadRequestException('Invalid invitation token')
    }

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('This invitation has already been used or expired')
    }

    if (invite.expiresAt < new Date()) {
      await this.data.invite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      })
      throw new BadRequestException('This invitation has expired')
    }

    // Verify email matches the invitation
    const cleanEmail = payload.email?.trim()?.toLowerCase()
    if (cleanEmail !== invite.email.toLowerCase()) {
      throw new BadRequestException('Email address does not match the invitation')
    }

    // Create the user (no organization)
    const user = await this.createUser({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      password: payload.password,
      phone: payload.phone,
      avatarUrl: payload.avatarUrl,
    })

    if (user) {
      const roleId = invite.roleId ?? invite.role?.id
      if (!roleId) {
        throw new BadRequestException('Invitation is missing a role')
      }

      // Add user to the organization from the invitation
      await this.data.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: invite.organizationId,
          roleId,
        },
      })

      // Set as active organization
      await this.data.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: invite.organizationId },
      })

      // Mark invitation as accepted
      await this.data.invite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      })

      // Send verification email
      const validateEmailToken = generateToken()
      const validateEmailTokenExpires = generateExpireDate()
      await this.data.user.update({
        where: { id: user.id },
        data: { validateEmailToken, validateEmailTokenExpires },
      })

      const appName = this.config.get('app.name')
      const siteUrl = this.config.get('siteUrl')
      const verificationUrl = `${siteUrl}/verify-email?token=${validateEmailToken}&type=initial`

      await this.emailService.sendTemplate(cleanEmail, {
        templateId: 'email-verification',
        variables: {
          userName: user?.firstName || 'there',
          verificationUrl,
          appName,
          expirationHours: 24,
        },
      })

      Logger.log(
        `✓ User registered via invitation: ${cleanEmail} joined ${invite.organization.name}`,
      )

      return this.signUser(user, false, undefined, sessionInfo)
    }
    return null
  }

  async login(input: LoginInput, sessionInfo?: SessionInfo) {
    const email = input?.email?.trim()?.toLowerCase()
    const password = input.password?.trim()
    const authUser = await this.findUserByEmail(email)

    // Use generic error message to prevent email enumeration
    const genericError = 'Invalid email or password'

    if (!authUser) {
      // Log failed attempt even though user doesn't exist (helps detect attacks)
      await this.data.loginAttempt.create({
        data: {
          email,
          success: false,
          reason: 'INVALID_EMAIL',
        },
      })
      // Add delay to slow down brute force attacks
      await this.addBruteForceDelay()
      throw new BadRequestException(genericError)
    }

    const user: User = authUser

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
      await this.data.loginAttempt.create({
        data: {
          userId: user.id,
          email,
          success: false,
          reason: 'ACCOUNT_LOCKED',
        },
      })
      // Add delay to slow down brute force attacks
      await this.addBruteForceDelay()
      throw new BadRequestException(
        `Account is locked. Please try again in ${minutesLeft} minutes.`,
      )
    }

    // Check if account is disabled
    if (!user.isActive) {
      await this.data.loginAttempt.create({
        data: {
          userId: user.id,
          email,
          success: false,
          reason: 'ACCOUNT_DISABLED',
        },
      })
      // Add delay to slow down brute force attacks
      await this.addBruteForceDelay()
      throw new BadRequestException('Account has been disabled. Please contact support.')
    }

    if (!user?.password) {
      await this.data.loginAttempt.create({
        data: {
          userId: user.id,
          email,
          success: false,
          reason: 'INVALID_PASSWORD',
        },
      })
      // Add delay to slow down brute force attacks
      await this.addBruteForceDelay()
      throw new BadRequestException(genericError)
    }

    const passwordValid = validatePassword(password, user.password)

    if (!passwordValid) {
      // Increment failed login count
      const updatedUser = await this.data.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: { increment: 1 },
          lastFailedLogin: new Date(),
        },
      })

      // Log failed attempt
      await this.data.loginAttempt.create({
        data: {
          userId: user.id,
          email,
          success: false,
          reason: 'INVALID_PASSWORD',
        },
      })

      // Check if we should lock the account (5 failed attempts)
      if (updatedUser.failedLoginCount >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000) // Lock for 15 minutes
        await this.data.user.update({
          where: { id: user.id },
          data: {
            lockedUntil: lockUntil,
            failedLoginCount: 0, // Reset counter
          },
        })

        // Log account locked event with IP context
        await this.securityEvents.logAccountLocked(user.id, 'Too many failed login attempts', {
          ipAddress: sessionInfo?.ipAddress,
          userAgent: sessionInfo?.userAgent,
        })

        // Add delay to slow down brute force attacks
        await this.addBruteForceDelay()
        throw new BadRequestException(
          'Too many failed login attempts. Account locked for 15 minutes.',
        )
      }

      // Add delay to slow down brute force attacks
      await this.addBruteForceDelay()
      throw new BadRequestException(genericError)
    }

    // Successful password validation - reset counters
    await this.data.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null, // Clear any existing lock
      },
    })

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // Generate temporary token for 2FA verification (short-lived, 5 minutes)
      const tempPayload = {
        userId: user.id,
        temp2FA: true,
        remember: input.remember || false,
      }
      const tempToken = this.jwtService.sign(tempPayload, { expiresIn: '5m' })

      Logger.log(`2FA required for login: ${email}`)

      return {
        requires2FA: true,
        tempToken,
        user: null, // Don't return user data until 2FA is verified
        token: null,
      }
    }

    // No 2FA required - complete login
    await this.data.user.update({
      where: { id: user.id },
      data: {
        lastSuccessfulLogin: new Date(),
      },
    })

    // Log successful attempt
    await this.data.loginAttempt.create({
      data: {
        userId: user.id,
        email,
        success: true,
      },
    })

    return this.signUser(user, input.remember, undefined, sessionInfo)
  }

  async resendVerificationEmail(email: string): Promise<boolean> {
    const user = await this.findUserByEmail(email)
    if (!user) {
      throw new NotFoundException(`No user found for email: ${email}`)
    }
    const validateEmailToken = generateToken()
    const validateEmailTokenExpires = generateExpireDate()
    await this.data.user.update({
      where: { id: user.id },
      data: { validateEmailToken, validateEmailTokenExpires },
    })
    const appName = this.config.get('app.name')
    const siteUrl = this.config.get('siteUrl')
    const verificationUrl = `${siteUrl}/verify-email?token=${validateEmailToken}&type=initial`

    await this.emailService.sendTemplate(email, {
      templateId: 'email-verification',
      variables: {
        userName: user?.firstName || 'there',
        verificationUrl,
        appName,
        expirationHours: 24,
      },
    })
    return true
  }

  async verifyEmail(token: string) {
    const user = await this.data.user.findFirst({ where: { validateEmailToken: token } })
    if (!user) {
      throw new NotFoundException('Invalid or already used verification token')
    }
    if (!user.validateEmailTokenExpires) {
      throw new BadRequestException('No email verification expiration found')
    }
    if (user.validateEmailTokenExpires.valueOf() < new Date(Date.now()).valueOf()) {
      throw new BadRequestException('Your email verification token has expired')
    }

    const updatedUser = await this.data.user.update({
      where: { id: user.id },
      data: {
        emailValidated: true,
        validateEmailToken: null,
        validateEmailTokenExpires: null,
      },
    })

    // Send welcome email after successful verification
    const appName = this.config.get('app.name')
    const siteUrl = this.config.get('siteUrl')
    const primaryEmail = await this.data.email.findFirst({
      where: { userId: user.id, primary: true },
    })

    if (primaryEmail?.email) {
      await this.emailService.sendTemplate(primaryEmail.email, {
        templateId: 'welcome',
        variables: {
          userName: user?.firstName || 'there',
          appName,
          dashboardUrl: `${siteUrl}/dashboard`,
        },
      })
    }

    return updatedUser
  }

  async changeEmail(userId: string, newEmail: string, sessionInfo?: SessionInfo): Promise<boolean> {
    const cleanEmail = newEmail?.trim()?.toLowerCase()

    // Check if email is already in use
    const existingEmail = await this.data.email.findUnique({
      where: { email: cleanEmail },
    })

    if (existingEmail) {
      throw new BadRequestException('This email is already in use')
    }

    const user = await this.data.user.findUnique({
      where: { id: userId },
      include: { emails: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Generate verification token
    const verifyToken = generateToken()
    const verifyExpires = generateExpireDate()

    // Find the current primary email
    const primaryEmail = user.emails.find(e => e.primary)

    if (!primaryEmail) {
      throw new BadRequestException('No primary email found')
    }

    // Update the primary email to the new address with unverified status
    await this.data.email.update({
      where: { id: primaryEmail.id },
      data: {
        email: cleanEmail,
        verified: false,
        verifyToken,
        verifyExpires,
      },
    })

    // Mark user as having unvalidated email
    await this.data.user.update({
      where: { id: userId },
      data: { emailValidated: false },
    })

    // Log security event with IP context
    await this.securityEvents.logEmailChanged(userId, primaryEmail.email, cleanEmail, {
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
    })

    // Send verification email to new address
    const appName = this.config.get('app.name')
    const siteUrl = this.config.get('siteUrl')
    const verificationUrl = `${siteUrl}/verify-email?token=${verifyToken}&type=change`

    await this.emailService.sendTemplate(cleanEmail, {
      templateId: 'email-verification',
      variables: {
        userName: user?.firstName || 'there',
        verificationUrl,
        appName,
        expirationHours: 24,
      },
    })

    Logger.log(`Email change requested for user ${userId}: ${primaryEmail.email} → ${cleanEmail}`)

    return true
  }

  async verifyEmailChange(token: string): Promise<User> {
    const email = await this.data.email.findFirst({
      where: { verifyToken: token },
      include: { user: true },
    })

    if (!email?.user) {
      throw new NotFoundException('Invalid or already used verification token')
    }

    if (!email.verifyExpires) {
      throw new BadRequestException('No verification expiration found')
    }

    if (email.verifyExpires.valueOf() < new Date(Date.now()).valueOf()) {
      throw new BadRequestException('Your verification token has expired')
    }

    // Mark email as verified
    await this.data.email.update({
      where: { id: email.id },
      data: {
        verified: true,
        verifyToken: null,
        verifyExpires: null,
      },
    })

    // Mark user email as validated
    const userId = email.userId
    if (!userId) {
      throw new BadRequestException('Email verification record is missing a user')
    }

    const updatedUser = await this.data.user.update({
      where: { id: userId },
      data: { emailValidated: true },
    })

    Logger.log(`Email change verified for user ${email.userId}: ${email.email}`)

    return updatedUser
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    sessionInfo?: SessionInfo,
    currentSessionId?: string,
  ): Promise<boolean> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.password) {
      throw new BadRequestException('User does not have a password set')
    }

    // Verify current password
    const isCurrentPasswordValid = validatePassword(input.currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect')
    }

    // Hash new password
    const hashedNewPassword = hashPassword(input.newPassword)

    // Check if new password matches current password
    if (validatePassword(input.newPassword, user.password)) {
      throw new BadRequestException('New password cannot be the same as your current password')
    }

    // Check password history (prevent reuse of last 5 passwords)
    const passwordHistory = await this.data.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    for (const historicalPassword of passwordHistory) {
      if (validatePassword(input.newPassword, historicalPassword.passwordHash)) {
        throw new BadRequestException(
          'This password was used recently. Please choose a different password.',
        )
      }
    }

    // Update password
    await this.data.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    })

    // Save current password to history
    await this.data.passwordHistory.create({
      data: {
        userId,
        passwordHash: user.password,
      },
    })

    // Log security event with IP context
    await this.securityEvents.logPasswordChanged(userId, {
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
    })

    // Send password changed notification
    const appName = this.config.get('app.name')
    const primaryEmail = await this.data.email.findFirst({
      where: { userId: user.id, primary: true },
    })

    if (primaryEmail?.email) {
      await this.emailService.sendTemplate(primaryEmail.email, {
        templateId: 'password-changed',
        variables: {
          userName: user?.firstName || 'there',
          appName,
          changeTime: new Date(),
        },
      })
    }

    // Keep the password-changing browser session active, but revoke other sessions.
    await this.sessionService.invalidateAllUserSessions(userId, currentSessionId)
    Logger.log(
      `Password changed for user ${userId} - other sessions invalidated` +
        (currentSessionId ? ` (kept current session ${currentSessionId})` : ''),
    )

    return true
  }

  async emulateUser(input: EmulateUserInput, adminId: string) {
    Logger.log(`🎭 EmulateUser called: adminId=${adminId}, targetUserId=${input?.userId}`)

    const user = await this.data.user.findUnique({
      where: { id: input?.userId },
      include: { emails: true },
    })
    if (!user) {
      Logger.error(`❌ EmulateUser failed: No user found for id: ${input?.userId}`)
      throw new NotFoundException(`No user found for id: ${input?.userId}`)
    }

    if (user.isSuperAdmin) {
      Logger.warn(`EmulateUser rejected: admin ${adminId} attempted to emulate admin ${user.id}`)
      throw new ForbiddenException('Cannot emulate a user with equal or higher privileges')
    }

    Logger.log(`✅ EmulateUser: User found - ${user.firstName} ${user.lastName}`)

    // Log emulation start to AuditLog
    await this.data.auditLog.create({
      data: {
        entityId: user.id,
        entityType: 'User',
        action: 'EMULATION_STARTED',
        userId: adminId,
        changes: {
          adminId,
          emulatedUserId: user.id,
          emulatedUserEmail: user.emails?.find(e => e.primary)?.email,
        },
      },
    })

    Logger.log(`Admin ${adminId} started emulating user ${user.id}`)

    // Sign user with emulation flag
    const result = this.signUser(user, false, adminId)
    Logger.log(`🎭 EmulateUser: Returning token with emulation flag`)
    return result
  }

  async endEmulation(token: string): Promise<UserToken> {
    // Decode the current token to get emulation data
    const decoded = this.jwtService.decode(token) as any

    if (!decoded?.isEmulating || !decoded?.originalAdminId) {
      throw new BadRequestException('Not currently emulating a user')
    }

    const emulatedUserId = decoded.userId
    const adminId = decoded.originalAdminId

    // Get the admin user
    const admin = await this.data.user.findUnique({ where: { id: adminId } })
    if (!admin) {
      throw new NotFoundException('Original admin user not found')
    }

    // Log emulation end to AuditLog
    await this.data.auditLog.create({
      data: {
        entityId: emulatedUserId,
        entityType: 'User',
        action: 'EMULATION_ENDED',
        userId: adminId,
        changes: {
          adminId,
          emulatedUserId,
        },
      },
    })

    Logger.log(`Admin ${adminId} ended emulation of user ${emulatedUserId}`)

    // Return admin to their own session (no emulation)
    return this.signUser(admin)
  }

  async forgotPassword(email: string, sessionInfo?: SessionInfo): Promise<boolean> {
    const user = await this.findUserByEmail(email)

    if (!user) {
      Logger.warn(`Forgot password reset for non-existing user ${email}`)
      throw new Error(`${email} is not a user`)
    }

    const passwordResetToken = generateToken()
    const passwordResetExpires = generateExpireDate()

    await this.data.user.update({
      where: { id: user.id },
      data: { passwordResetToken, passwordResetExpires },
    })

    // Log security event with IP context
    await this.securityEvents.logPasswordResetRequested(user.id, {
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
    })

    const appName = this.config.get('app.name')
    const siteUrl = this.config.get('siteUrl')
    const resetUrl = `${siteUrl}/reset-password?token=${passwordResetToken}`

    await this.emailService.sendTemplate(email, {
      templateId: 'password-reset',
      variables: {
        userName: user?.firstName || 'there',
        resetUrl,
        appName,
        expirationMinutes: 30,
      },
    })
    return true
  }

  async resetPassword(password: string, token: string, sessionInfo?: SessionInfo): Promise<User> {
    const user = await this.data.user.findFirst({ where: { passwordResetToken: token } })

    if (!user) {
      Logger.warn(`There is no user associated with the password reset token ${token}`)
      throw new Error(`This token has been used or is invalid.`)
    }

    if (!user?.passwordResetExpires) {
      throw new Error('No password reset expiration date found.')
    }

    if (user?.passwordResetExpires?.valueOf() < new Date(Date.now()).valueOf()) {
      Logger.warn(`PasswordResetToken ${token} expired on ${user.passwordResetExpires}.`)
      throw new Error(`Your password reset token has expired.`)
    }

    const hashedPassword = hashPassword(password)

    // Check if new password matches current password
    if (user.password && validatePassword(password, user.password)) {
      throw new BadRequestException('New password cannot be the same as your current password')
    }

    // Check password history (prevent reuse of last 5 passwords)
    const passwordHistory = await this.data.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    for (const historicalPassword of passwordHistory) {
      if (validatePassword(password, historicalPassword.passwordHash)) {
        throw new BadRequestException(
          'This password was used recently. Please choose a different password.',
        )
      }
    }

    const updatedUser = await this.data.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: null,
        passwordResetExpires: null,
        password: hashedPassword,
      },
    })

    // Save old password to history if it exists
    if (user.password) {
      await this.data.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: user.password,
        },
      })
    }

    // Log security event with IP context
    await this.securityEvents.logPasswordChanged(user.id, {
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
    })

    // Send password changed notification
    const appName = this.config.get('app.name')
    const primaryEmail = await this.data.email.findFirst({
      where: { userId: user.id, primary: true },
    })

    if (primaryEmail?.email) {
      await this.emailService.sendTemplate(primaryEmail.email, {
        templateId: 'password-changed',
        variables: {
          userName: user?.firstName || 'there',
          appName,
          changeTime: new Date(),
        },
      })
    }

    return updatedUser
  }

  async signUser(
    user: User,
    rememberMe = false,
    emulatingAdminId?: string,
    sessionInfo?: SessionInfo,
  ): Promise<UserToken> {
    // Remember Me: 30 days, otherwise: 7 days
    const expiresIn = rememberMe ? '30d' : '7d'

    const payload: any = { userId: user?.id }

    // If emulating, add emulation data to JWT
    Logger.log(`🔍 signUser called with emulatingAdminId: ${emulatingAdminId}`)
    if (emulatingAdminId) {
      payload.isEmulating = true
      payload.originalAdminId = emulatingAdminId
      Logger.log(`🎭 Emulation JWT created: userId=${user?.id}, adminId=${emulatingAdminId}`)
    } else {
      Logger.log(`⚠️ No emulatingAdminId provided - creating normal JWT`)
    }

    // Create session if session info is provided
    if (sessionInfo) {
      const sessionId = await this.sessionService.createSession(
        user.id,
        sessionInfo,
        false, // 2FA verification status - will be updated later if needed
      )
      payload.sessionId = sessionId
    }

    Logger.log(`📦 Final JWT payload before signing:`, JSON.stringify(payload))
    const token = this.jwtService.sign(payload, { expiresIn })
    return { token, user }
  }

  validateUser(userId: string) {
    return this.data.user.findUnique({
      where: { id: userId },
      include: authUserRelations,
    })
  }

  getUserFromToken(token: string) {
    const userId = this.jwtService.decode(token)['userId']
    return this.data.user.findUnique({
      where: { id: userId },
      include: authUserRelations,
    })
  }

  findUserByEmail(email: string): Promise<User | null> {
    const cleanEmail = email?.trim()?.toLowerCase()
    return this.data.user.findFirst({
      where: {
        emails: {
          some: {
            email: {
              equals: cleanEmail,
              mode: 'insensitive',
            },
          },
        },
      },
      include: authUserRelations,
    })
  }

  public setCookie(res: Response, token: string): Response {
    const cookie = this.config.getOrThrow<{ name: string; options: CookieOptions }>('api.cookie')
    return res?.cookie(cookie.name, token, cookie.options)
  }

  public clearCookie(res: Response): Response {
    const cookie = this.config.getOrThrow<{ name: string; options: CookieOptions }>('api.cookie')
    return res.clearCookie(cookie.name, cookie.options)
  }

  public getCookieName(): string {
    return this.config.getOrThrow<{ name: string }>('api.cookie').name
  }

  public decodeToken(token: string): any {
    try {
      return this.jwtService.decode(token)
    } catch (error) {
      Logger.error('Failed to decode JWT token:', error)
      return null
    }
  }

  /**
   * Unlock a locked user account (admin function)
   */
  async unlockAccount(userId: string, sessionInfo?: SessionInfo): Promise<User> {
    const user = await this.data.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const updatedUser = await this.data.user.update({
      where: { id: userId },
      data: {
        lockedUntil: null,
        failedLoginCount: 0,
      },
    })

    // Log security event with IP context
    await this.securityEvents.logAccountUnlocked(userId, {
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
    })

    Logger.log(`Account unlocked for user ${userId}`)

    return updatedUser
  }

  /**
   * Setup 2FA - Generate secret and QR code
   */
  async setup2FA(userId: string): Promise<Setup2FAOutput> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      include: { emails: { where: { primary: true } } },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled for this account')
    }

    const primaryEmail = user.emails[0]?.email || user.id
    const issuer = this.config.get('twoFactor.issuer')

    const { secret, otpauthUrl } = generate2FASecret(issuer, primaryEmail)

    if (!otpauthUrl) {
      throw new BadRequestException('Failed to generate 2FA URL')
    }

    const qrCode = await generateQRCode(otpauthUrl)

    // Store secret temporarily (encrypted) - user must verify before it's fully enabled
    const encryptionKey = this.config.get('twoFactor.encryptionKey')
    const encryptedSecret = encryptSecret(secret, encryptionKey)

    await this.data.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: false, // Not enabled until verified
      },
    })

    Logger.log(`2FA setup initiated for user ${userId}`)

    return {
      secret,
      qrCode,
      otpauthUrl,
    }
  }

  /**
   * Verify 2FA code and enable 2FA
   */
  async enable2FA(
    userId: string,
    code: string,
    sessionInfo?: SessionInfo,
  ): Promise<Enable2FAOutput> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      include: { emails: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException('2FA setup not initiated. Please call setup2FA first.')
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled')
    }

    // Decrypt and verify the code
    const encryptionKey = this.config.get('twoFactor.encryptionKey')
    const secret = decryptSecret(user.twoFactorSecret, encryptionKey)
    const window = this.config.get('twoFactor.window')

    const isValid = verify2FACode(secret, code, window)

    if (!isValid) {
      throw new BadRequestException('Invalid 2FA code')
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(10)
    const hashedBackupCodes = backupCodes.map(hashBackupCode)

    // Enable 2FA and store backup codes
    await this.data.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorMethod: 'AUTHENTICATOR',
        twoFactorRecoveryCodes: hashedBackupCodes,
      },
    })

    // Log security event with IP context
    await this.securityEvents.log2FAEnabled(userId, {
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
    })

    // Send 2FA enabled notification email
    const primaryEmail = user.emails?.find(e => e.primary)?.email
    if (primaryEmail) {
      const appName = this.config.get('app.name')
      const siteUrl = this.config.get('siteUrl')
      const securityUrl = `${siteUrl}/settings/security`

      await this.emailService.sendTemplate(primaryEmail, {
        templateId: 'twofa-enabled',
        variables: {
          userName: user.firstName || 'there',
          appName,
          securityUrl,
          backupCodesCount: backupCodes.length,
        },
      })
    }

    Logger.log(`2FA enabled for user ${userId}`)

    return {
      success: true,
      backupCodes, // Return plain codes once - user must save them
    }
  }

  /**
   * Disable 2FA
   */
  async disable2FA(
    userId: string,
    input: Disable2FAInput,
    sessionInfo?: SessionInfo,
  ): Promise<boolean> {
    const user = await this.data.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled')
    }

    // Verify password before disabling 2FA
    if (!user.password || !validatePassword(input.password, user.password)) {
      throw new BadRequestException('Invalid password')
    }

    // Disable 2FA and clear secrets
    await this.data.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
        twoFactorMethod: 'NONE',
      },
    })

    // Log security event with IP context
    await this.securityEvents.log2FADisabled(userId, {
      ipAddress: sessionInfo?.ipAddress,
      userAgent: sessionInfo?.userAgent,
    })

    Logger.log(`2FA disabled for user ${userId}`)

    return true
  }

  /**
   * Verify 2FA code during login
   */
  async verify2FALogin(userId: string, code: string): Promise<boolean> {
    const user = await this.data.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled for this account')
    }

    // Decrypt secret and verify code
    const encryptionKey = this.config.get('twoFactor.encryptionKey')
    const secret = decryptSecret(user.twoFactorSecret, encryptionKey)
    const window = this.config.get('twoFactor.window')

    const isValid = verify2FACode(secret, code, window)

    if (isValid) {
      return true
    }

    // Check if it's a backup code
    const hashedCode = hashBackupCode(code)
    const backupCodeIndex = user.twoFactorRecoveryCodes.indexOf(hashedCode)

    if (backupCodeIndex !== -1) {
      // Remove used backup code
      const updatedCodes = [...user.twoFactorRecoveryCodes]
      updatedCodes.splice(backupCodeIndex, 1)

      await this.data.user.update({
        where: { id: userId },
        data: {
          twoFactorRecoveryCodes: updatedCodes,
        },
      })

      Logger.log(`Backup code used for 2FA login by user ${userId}`)
      return true
    }

    return false
  }

  /**
   * Complete 2FA login - verify code and return full session token
   */
  async complete2FALogin(
    tempToken: string,
    code: string,
    sessionInfo?: SessionInfo,
  ): Promise<UserToken> {
    // Decode temp token
    const decoded = this.jwtService.decode(tempToken) as any

    if (!decoded?.temp2FA || !decoded?.userId) {
      throw new BadRequestException('Invalid or expired 2FA token')
    }

    const userId = decoded.userId
    const rememberMe = decoded.remember || false

    // Verify the 2FA code
    const isValid = await this.verify2FALogin(userId, code)

    if (!isValid) {
      throw new BadRequestException('Invalid 2FA code. Please try again.')
    }

    // Get full user data
    const user = await this.data.user.findUnique({
      where: { id: userId },
      include: authUserRelations,
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Update login success
    await this.data.user.update({
      where: { id: userId },
      data: {
        lastSuccessfulLogin: new Date(),
      },
    })

    // Log successful login
    const primaryEmail = user.emails?.find(e => e.primary)?.email || 'unknown'
    await this.data.loginAttempt.create({
      data: {
        userId: user.id,
        email: primaryEmail,
        success: true,
      },
    })

    Logger.log(`2FA login completed for user ${userId}`)

    // Return full session token
    return this.signUser(user, rememberMe, undefined, sessionInfo)
  }

  /**
   * Get all active sessions for current user
   */
  async getUserSessions(userId: string, currentSessionId?: string): Promise<UserSessionOutput[]> {
    const sessions = await this.sessionService.getUserActiveSessions(userId)

    // Map to output format and mark current session
    return sessions.map(session => ({
      ...session,
      deviceInfo: session.deviceInfo ?? undefined,
      ipAddress: session.ipAddress ?? undefined,
      isCurrent: session.id === currentSessionId,
    }))
  }

  /**
   * Invalidate a specific session
   */
  async invalidateSession(userId: string, sessionId: string): Promise<boolean> {
    // Verify the session belongs to the user
    const session = await this.data.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    })

    if (!session) {
      throw new NotFoundException('Session not found or does not belong to this user')
    }

    await this.sessionService.invalidateSession(sessionId)
    Logger.log(`Session ${sessionId} invalidated by user ${userId}`)
    return true
  }

  /**
   * Invalidate all sessions except the current one
   */
  async invalidateAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
    const count = await this.sessionService.invalidateAllUserSessions(userId, exceptSessionId)
    Logger.log(
      `User ${userId} invalidated ${count} sessions` +
        (exceptSessionId ? ` (kept current session)` : ''),
    )
    return count
  }

  /**
   * Export all user data (GDPR compliance)
   */
  async exportUserData(userId: string) {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      include: {
        emails: true,
        phoneNumbers: true,
        addresses: true,
        links: true,
        images: true,
        organizations: {
          include: {
            organization: true,
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
        UserPreference: true,
        activeSessions: true,
        SecurityEvent: {
          orderBy: { createdAt: 'desc' },
          take: 100, // Last 100 security events
        },
        loginAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 50, // Last 50 login attempts
        },
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Remove sensitive data
    const {
      password,
      passwordResetToken,
      passwordResetExpires,
      validateEmailToken,
      validateEmailTokenExpires,
      twoFactorSecret,
      twoFactorRecoveryCodes,
      ...safeUserData
    } = user

    const exportData = {
      personalInformation: {
        id: safeUserData.id,
        firstName: safeUserData.firstName,
        lastName: safeUserData.lastName,
        displayName: safeUserData.displayName,
        bio: safeUserData.bio,
        isSuperAdmin: safeUserData.isSuperAdmin,
        createdAt: safeUserData.createdAt,
        updatedAt: safeUserData.updatedAt,
      },
      emails: safeUserData.emails.map(e => ({
        email: e.email,
        emailType: e.emailType,
        primary: e.primary,
        verified: e.verified,
        createdAt: e.createdAt,
      })),
      phoneNumbers: safeUserData.phoneNumbers.map(p => ({
        phone: p.phone,
        phoneType: p.phoneType,
        primary: p.primary,
        createdAt: p.createdAt,
      })),
      addresses: safeUserData.addresses.map(a => ({
        address1: a.address1,
        address2: a.address2,
        city: a.city,
        region: a.region,
        postalCode: a.postalCode,
        addressType: a.addressType,
        isPrimary: a.isPrimary,
        createdAt: a.createdAt,
      })),
      links: safeUserData.links,
      preferences: safeUserData.UserPreference,
      organizations: safeUserData.organizations.map(om => ({
        organizationName: om.organization.name,
        roleName: om.role.name,
        permissions: om.role.permissions.map(p => `${p.subject}:${p.action}`),
        joinedAt: om.createdAt,
      })),
      securityInformation: {
        emailValidated: safeUserData.emailValidated,
        twoFactorEnabled: safeUserData.twoFactorEnabled,
        twoFactorMethod: safeUserData.twoFactorMethod,
        lastSuccessfulLogin: safeUserData.lastSuccessfulLogin,
        lastFailedLogin: safeUserData.lastFailedLogin,
        isActive: safeUserData.isActive,
        deactivatedAt: safeUserData.deactivatedAt,
        termsAcceptedAt: safeUserData.termsAcceptedAt,
        privacyPolicyAcceptedAt: safeUserData.privacyPolicyAcceptedAt,
      },
      activeSessions: safeUserData.activeSessions.map(s => ({
        deviceInfo: s.deviceInfo,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        twoFactorVerified: s.twoFactorVerified,
      })),
      securityEvents: safeUserData.SecurityEvent.map(e => ({
        eventType: e.eventType,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
      loginHistory: safeUserData.loginAttempts.map(l => ({
        email: l.email,
        success: l.success,
        reason: l.reason,
        ipAddress: l.ipAddress,
        userAgent: l.userAgent,
        location: l.location,
        createdAt: l.createdAt,
      })),
    }

    Logger.log(`User data exported for user ${userId}`)

    return {
      userData: exportData,
      exportedAt: new Date(),
      userId,
    }
  }

  /**
   * Delete user account (soft delete)
   */
  async deleteUserAccount(userId: string): Promise<boolean> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      include: {
        organizations: {
          include: {
            role: true,
            organization: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Check if user is the sole owner of any organizations
    const ownedOrganizations = user.organizations.filter(
      om => om.role.name === 'Owner' && om.organization.members.length === 1,
    )

    if (ownedOrganizations.length > 0) {
      throw new BadRequestException(
        'You are the sole owner of one or more organizations. Please transfer ownership or delete the organizations before deleting your account.',
      )
    }

    // Soft delete: deactivate account instead of hard delete
    await this.data.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        // Invalidate all sessions
        activeSessions: {
          updateMany: {
            where: { userId },
            data: { isValid: false },
          },
        },
      },
    })

    Logger.warn(`User account deleted (soft delete): ${userId}`)

    return true
  }

  /**
   * Transfer organization ownership to another member
   */
  async transferOrganizationOwnership(
    currentOwnerId: string,
    organizationId: string,
    newOwnerUserId: string,
  ): Promise<boolean> {
    // Verify current owner
    const currentOwnerMembership = await this.data.organizationMember.findFirst({
      where: {
        userId: currentOwnerId,
        organizationId,
        role: {
          name: 'Owner',
        },
      },
      include: {
        role: true,
      },
    })

    if (!currentOwnerMembership) {
      throw new BadRequestException('You are not the owner of this organization')
    }

    // Verify new owner is a member
    const newOwnerMembership = await this.data.organizationMember.findFirst({
      where: {
        userId: newOwnerUserId,
        organizationId,
      },
      include: {
        role: true,
      },
    })

    if (!newOwnerMembership) {
      throw new BadRequestException('New owner must be a member of the organization')
    }

    // Get Owner and Admin roles
    const ownerRole = await this.data.role.findFirst({
      where: {
        name: 'Owner',
        organizationId,
      },
    })

    const adminRole = await this.data.role.findFirst({
      where: {
        name: 'Admin',
        organizationId,
      },
    })

    if (!ownerRole || !adminRole) {
      throw new Error('Organization roles not properly configured')
    }

    // Transfer ownership in a transaction
    await this.data.$transaction([
      // Demote current owner to admin
      this.data.organizationMember.update({
        where: { id: currentOwnerMembership.id },
        data: { roleId: adminRole.id },
      }),
      // Promote new owner
      this.data.organizationMember.update({
        where: { id: newOwnerMembership.id },
        data: { roleId: ownerRole.id },
      }),
    ])

    Logger.log(
      `Organization ${organizationId} ownership transferred from ${currentOwnerId} to ${newOwnerUserId}`,
    )

    return true
  }

  async isSessionValid(sessionId: string): Promise<boolean> {
    try {
      const session = await this.data.userSession.findUnique({
        where: { id: sessionId },
        select: { isValid: true },
      })
      return session?.isValid ?? false
    } catch (error) {
      Logger.error('Error checking session validity', error)
      return false
    }
  }
}
