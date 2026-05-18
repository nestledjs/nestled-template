import { AuthService } from './auth.service'
import { OAuthService } from './oauth.service'
import { SessionService } from './session.service'
import {
  Args,
  Context,
  Info,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql'
import { Logger, UseGuards } from '@nestjs/common'
import { GraphQLResolveInfo } from 'graphql/type'
import { CtxUser, GqlAuthGuard, GqlAuthAdminGuard } from '@nestled-template/api/utils'
import type { NestContextType } from '@nestled-template/api/utils'
import { UserToken } from './models'
import { User } from '@nestled-template/api/core/models'
import {
  ChangeEmailInput,
  ChangePasswordInput,
  Disable2FAInput,
  EmulateUserInput,
  Enable2FAOutput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  RegisterWithInvitationInput,
  ResetPasswordInput,
  Setup2FAOutput,
  VerifyEmailInput,
  Verify2FAInput,
  OAuthProviderInfo,
  LinkOAuthInput,
  UnlinkOAuthInput,
  OAuthProvider,
  UserSessionOutput,
  ExportUserDataOutput,
  TransferOwnershipInput,
} from './dto'
import { ConfigService } from '@nestjs/config'

@Resolver(() => UserToken)
export class AuthResolver {
  constructor(
    private readonly service: AuthService,
    private readonly oauthService: OAuthService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService,
  ) {}

  @Query(() => User, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async me(@CtxUser() user: User, @Info() info: GraphQLResolveInfo) {
    const validatedUser = await this.service.validateUser(user.id)

    // The user object from @CtxUser() already has emulation fields attached by JwtStrategy
    // Preserve them in the validated user
    const userWithEmulation = user as any
    if (userWithEmulation.isEmulating && userWithEmulation.originalAdminId) {
      Logger.log(
        `[ME Query] 🎭 Emulation detected: admin ${userWithEmulation.originalAdminId} emulating user ${user.id}`,
      )
      return {
        ...validatedUser,
        isEmulating: true,
        originalAdminId: userWithEmulation.originalAdminId,
      }
    }

    return validatedUser
  }

  @Mutation(() => UserToken, { nullable: true })
  async login(
    @Context() context: NestContextType,
    @Args('input') input: LoginInput,
  ): Promise<UserToken> {
    // Extract session info from request
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)

    const userToken = await this.service.login(input, sessionInfo)

    // If 2FA is required, return temp token without setting cookie
    if (userToken.requires2FA) {
      console.log('[Login] 2FA required - returning temp token')
      return userToken
    }

    // Normal login - set cookie
    if (!userToken?.token) {
      throw new Error('Unable to create login token')
    }

    // Set the JWT token cookie - this is all we need for authentication
    // The browser will automatically include this httpOnly cookie with all requests
    this.service.setCookie(context.res, userToken.token)

    console.log('[Login] Set JWT cookie for user:', {
      userId: userToken.user?.id,
      isSuperAdmin: userToken.user?.isSuperAdmin,
      tokenLength: userToken.token?.length,
    })

    return userToken
  }

  @Mutation(() => UserToken, { nullable: true })
  async complete2FALogin(
    @Context() context: NestContextType,
    @Args('tempToken') tempToken: string,
    @Args('code') code: string,
  ): Promise<UserToken> {
    // Extract session info from request
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)

    const userToken = await this.service.complete2FALogin(tempToken, code, sessionInfo)

    if (!userToken?.token) {
      throw new Error('Unable to complete 2FA login')
    }

    // Set the JWT token cookie
    this.service.setCookie(context.res, userToken.token)

    console.log('[2FA Login] Set JWT cookie for user:', {
      userId: userToken.user?.id,
      tokenLength: userToken.token?.length,
    })

    return userToken
  }

  @Mutation(() => Boolean, { nullable: true })
  async logout(@Context() context: NestContextType) {
    Logger.log('LOGOUT ++++++++')

    // Get session ID from JWT and invalidate it
    // Check both cookie and Authorization header
    let token = context.req.cookies?.[this.service.getCookieName()]

    // If no cookie token, check Authorization header
    if (!token) {
      const authHeader = context.req.headers?.authorization
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }

    if (token) {
      const decoded = (this.service as any).jwtService.decode(token)
      const sessionId = decoded?.sessionId
      if (sessionId) {
        await this.sessionService.invalidateSession(sessionId)
        Logger.log(`Session ${sessionId} invalidated during logout`)
      }
    }

    this.service.clearCookie(context.res)
    return true
  }

  @Mutation(() => UserToken, { nullable: true })
  async register(@Context() context: NestContextType, @Args('input') input: RegisterInput) {
    // Extract session info from request
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)

    const userToken = await this.service.register(input, sessionInfo)
    if (!userToken?.token) {
      throw new Error('Unable to register')
    }
    this.service.setCookie(context.res, userToken.token)
    return userToken
  }

  @Mutation(() => UserToken, { nullable: true })
  async registerWithInvitation(
    @Context() context: NestContextType,
    @Args('input') input: RegisterWithInvitationInput,
  ) {
    // Extract session info from request
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)

    const userToken = await this.service.registerWithInvitation(input, sessionInfo)
    if (!userToken?.token) {
      throw new Error('Unable to register with invitation')
    }
    this.service.setCookie(context.res, userToken.token)
    return userToken
  }

  @Mutation(() => Boolean, { nullable: true })
  forgotPassword(
    @Context() context: NestContextType,
    @Args('input') input: ForgotPasswordInput,
  ): Promise<boolean> {
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)
    return this.service.forgotPassword(input?.email?.trim()?.toLowerCase(), sessionInfo)
  }

  @Mutation(() => User, { nullable: true })
  resetPassword(
    @Context() context: NestContextType,
    @Args('input') input: ResetPasswordInput,
  ): Promise<User> {
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)
    return this.service.resetPassword(input.password, input.token, sessionInfo)
  }

  @Mutation(() => Boolean)
  resendVerificationEmail(@Args('email') email: string) {
    return this.service.resendVerificationEmail(email)
  }

  @Mutation(() => User)
  verifyEmail(@Args('input') input: VerifyEmailInput) {
    return this.service.verifyEmail(input.token)
  }

  @Mutation(() => UserToken, { nullable: true })
  @UseGuards(GqlAuthAdminGuard)
  async emulateUser(
    @Context() context: NestContextType,
    @CtxUser() admin: User,
    @Args('input') input: EmulateUserInput,
  ): Promise<UserToken> {
    const userToken = await this.service.emulateUser(input, admin.id)
    if (!userToken?.token) {
      throw new Error('Unable to emulate user')
    }
    this.service.setCookie(context.res, userToken?.token)
    return userToken
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async changeEmail(
    @Context() context: NestContextType,
    @CtxUser() user: User,
    @Args('input') input: ChangeEmailInput,
  ): Promise<boolean> {
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)
    return this.service.changeEmail(user.id, input.newEmail, sessionInfo)
  }

  @Mutation(() => User)
  async verifyEmailChange(@Args('token') token: string): Promise<User> {
    return this.service.verifyEmailChange(token)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async changePassword(
    @Context() context: NestContextType,
    @CtxUser() user: User,
    @Args('input') input: ChangePasswordInput,
  ): Promise<boolean> {
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)
    const token = context.req.cookies?.[this.service.getCookieName()]
    const decoded = token ? (this.service as any).jwtService.decode(token) : null
    const currentSessionId = decoded?.sessionId

    return this.service.changePassword(user.id, input, sessionInfo, currentSessionId)
  }

  @Mutation(() => UserToken, { nullable: true })
  @UseGuards(GqlAuthGuard) // Changed from GqlAuthAdminGuard - we need to check JWT payload instead
  async endEmulation(
    @CtxUser() user: User,
    @Context() context: NestContextType,
  ): Promise<UserToken> {
    // Check if current session is actually an emulation
    const userWithEmulation = user as any
    if (!userWithEmulation.isEmulating || !userWithEmulation.originalAdminId) {
      throw new Error('Not currently emulating a user')
    }

    Logger.log(
      `[EndEmulation] Admin ${userWithEmulation.originalAdminId} ending emulation of user ${user.id}`,
    )

    // Get token from cookie
    const token = context.req.cookies?.[this.service.getCookieName()]
    if (!token) {
      throw new Error('No authentication token found')
    }

    const userToken = await this.service.endEmulation(token)
    if (!userToken?.token) {
      throw new Error('Unable to end emulation')
    }

    // Set new cookie with admin's session
    this.service.setCookie(context.res, userToken.token)
    return userToken
  }

  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  async unlockAccount(
    @Context() context: NestContextType,
    @CtxUser() user: User,
    @Args('userId') userId: string,
  ): Promise<User> {
    // Only super admins can unlock accounts
    if (!user.isSuperAdmin) {
      throw new Error('Only super admins can unlock accounts')
    }
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)
    return this.service.unlockAccount(userId, sessionInfo)
  }

  @Mutation(() => Setup2FAOutput)
  @UseGuards(GqlAuthGuard)
  async setup2FA(@CtxUser() user: User): Promise<Setup2FAOutput> {
    return this.service.setup2FA(user.id)
  }

  @Mutation(() => Enable2FAOutput)
  @UseGuards(GqlAuthGuard)
  async enable2FA(
    @Context() context: NestContextType,
    @CtxUser() user: User,
    @Args('input') input: Verify2FAInput,
  ): Promise<Enable2FAOutput> {
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)
    return this.service.enable2FA(user.id, input.code, sessionInfo)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async disable2FA(
    @Context() context: NestContextType,
    @CtxUser() user: User,
    @Args('input') input: Disable2FAInput,
  ): Promise<boolean> {
    const sessionInfo = this.sessionService.extractSessionInfo(context.req)
    return this.service.disable2FA(user.id, input, sessionInfo)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async verify2FACode(
    @CtxUser() user: User,
    @Args('input') input: Verify2FAInput,
  ): Promise<boolean> {
    return this.service.verify2FALogin(user.id, input.code)
  }

  @Query(() => [OAuthProviderInfo])
  availableOAuthProviders(): OAuthProviderInfo[] {
    const providers: OAuthProviderInfo[] = []

    if (this.config.get<boolean>('oauth.google.enabled')) {
      providers.push({
        provider: OAuthProvider.GOOGLE,
        enabled: true,
        name: 'Google',
      })
    }

    if (this.config.get<boolean>('oauth.github.enabled')) {
      providers.push({
        provider: OAuthProvider.GITHUB,
        enabled: true,
        name: 'GitHub',
      })
    }

    return providers
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async linkOAuthAccount(
    @CtxUser() user: User,
    @Args('input') input: LinkOAuthInput,
  ): Promise<boolean> {
    await this.oauthService.linkOAuthAccount(user.id, input.provider, input.token)
    return true
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async unlinkOAuthAccount(
    @CtxUser() user: User,
    @Args('input') input: UnlinkOAuthInput,
  ): Promise<boolean> {
    await this.oauthService.unlinkOAuthAccount(user.id, input.provider)
    return true
  }

  @Query(() => [UserSessionOutput])
  @UseGuards(GqlAuthGuard)
  async getUserSessions(
    @Context() context: NestContextType,
    @CtxUser() user: User,
  ): Promise<UserSessionOutput[]> {
    // Get current session ID from JWT
    const token = context.req.cookies?.[this.service.getCookieName()]
    const decoded = token ? (this.service as any).jwtService.decode(token) : null
    const currentSessionId = decoded?.sessionId

    return this.service.getUserSessions(user.id, currentSessionId)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async invalidateSession(
    @CtxUser() user: User,
    @Args('sessionId') sessionId: string,
  ): Promise<boolean> {
    return this.service.invalidateSession(user.id, sessionId)
  }

  @Mutation(() => Number)
  @UseGuards(GqlAuthGuard)
  async invalidateAllSessions(
    @Context() context: NestContextType,
    @CtxUser() user: User,
  ): Promise<number> {
    // Get current session ID from JWT to exclude it
    const token = context.req.cookies?.[this.service.getCookieName()]
    const decoded = token ? (this.service as any).jwtService.decode(token) : null
    const currentSessionId = decoded?.sessionId

    return this.service.invalidateAllSessions(user.id, currentSessionId)
  }

  @ResolveField('user')
  user(@Parent() auth: UserToken) {
    // If 2FA is required, user field should be null until 2FA is completed
    if (auth?.requires2FA && !auth?.token) {
      return null
    }

    if (!auth?.token) {
      throw new Error('No AuthToken for resolved user')
    }
    return this.service.getUserFromToken(auth.token)
  }

  @Query(() => ExportUserDataOutput)
  @UseGuards(GqlAuthGuard)
  async exportUserData(@CtxUser() user: User): Promise<ExportUserDataOutput> {
    return this.service.exportUserData(user.id)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteUserAccount(@CtxUser() user: User): Promise<boolean> {
    return this.service.deleteUserAccount(user.id)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async transferOrganizationOwnership(
    @CtxUser() user: User,
    @Args('input') input: TransferOwnershipInput,
  ): Promise<boolean> {
    return this.service.transferOrganizationOwnership(
      user.id,
      input.organizationId,
      input.newOwnerUserId,
    )
  }
}
