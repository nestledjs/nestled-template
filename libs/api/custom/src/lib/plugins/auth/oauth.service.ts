import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OAuth2Client } from 'google-auth-library'
import { OAuthApp } from '@octokit/oauth-app'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { OAuthProvider } from './dto'

export interface OAuthUserProfile {
  provider: OAuthProvider
  providerUserId: string
  email: string
  name?: string
  picture?: string
}

@Injectable()
export class OAuthService {
  private googleClient: OAuth2Client | null = null
  private githubApp: OAuthApp | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly data: ApiCoreDataAccessService,
  ) {
    this.initializeProviders()
  }

  private initializeProviders() {
    // Gate on the computed `enabled` flag (which rejects `.env.example` placeholder values like
    // `your-google-client-id`) rather than raw presence, so an uncommented placeholder does not
    // build a junk OAuth client that then fails at runtime.
    const googleClientId = this.config.get<string>('oauth.google.clientId')
    const googleClientSecret = this.config.get<string>('oauth.google.clientSecret')
    if (this.config.get<boolean>('oauth.google.enabled') && googleClientId && googleClientSecret) {
      this.googleClient = new OAuth2Client(googleClientId, googleClientSecret)
    }

    // Initialize GitHub OAuth
    const githubClientId = this.config.get<string>('oauth.github.clientId')
    const githubClientSecret = this.config.get<string>('oauth.github.clientSecret')
    if (this.config.get<boolean>('oauth.github.enabled') && githubClientId && githubClientSecret) {
      this.githubApp = new OAuthApp({
        clientType: 'oauth-app',
        clientId: githubClientId,
        clientSecret: githubClientSecret,
      })
    }
  }

  generateGoogleAuthorizationUrl(redirectUri: string): string {
    if (!this.googleClient) {
      throw new BadRequestException('Google OAuth is not configured')
    }

    return this.googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      redirect_uri: redirectUri,
    })
  }

  async exchangeGoogleCodeForIdToken(code: string): Promise<string> {
    if (!this.googleClient) {
      throw new BadRequestException('Google OAuth is not configured')
    }

    const { tokens } = await this.googleClient.getToken(code)
    if (!tokens.id_token) {
      throw new BadRequestException('No ID token received from Google')
    }

    return tokens.id_token
  }

  isGitHubConfigured(): boolean {
    return this.githubApp !== null
  }

  /**
   * Verify Google OAuth token and return user profile
   */
  async verifyGoogleToken(token: string): Promise<OAuthUserProfile> {
    if (!this.googleClient) {
      throw new BadRequestException('Google OAuth is not configured')
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: this.config.get<string>('oauth.google.clientId'),
      })

      const payload = ticket.getPayload()
      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException('Invalid Google token payload')
      }

      return {
        provider: OAuthProvider.GOOGLE,
        providerUserId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('Invalid Google token')
    }
  }

  /**
   * Exchange GitHub code for access token and fetch user profile
   */
  async verifyGitHubCode(code: string): Promise<OAuthUserProfile> {
    if (!this.githubApp) {
      throw new BadRequestException('GitHub OAuth is not configured')
    }

    try {
      // Exchange code for token
      const { authentication } = await this.githubApp.createToken({
        code,
      })

      // Fetch user profile
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${authentication.token}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new UnauthorizedException('Failed to fetch GitHub user profile')
      }

      const githubUser = (await response.json()) as {
        id: number
        email?: string
        name?: string
        avatar_url?: string
        login: string
      }

      // GitHub might not return email in main profile, fetch from emails endpoint if needed
      let email = githubUser.email
      if (!email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${authentication.token}`,
            Accept: 'application/json',
          },
        })

        if (emailResponse.ok) {
          const emails = (await emailResponse.json()) as Array<{
            email: string
            primary: boolean
            verified: boolean
          }>
          const primaryEmail = emails.find(e => e.primary && e.verified)
          email = primaryEmail?.email || emails[0]?.email
        }
      }

      if (!email) {
        throw new UnauthorizedException('GitHub account must have a verified email address')
      }

      return {
        provider: OAuthProvider.GITHUB,
        providerUserId: githubUser.id.toString(),
        email,
        name: githubUser.name || githubUser.login,
        picture: githubUser.avatar_url,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error
      }
      throw new UnauthorizedException('Invalid GitHub authorization code')
    }
  }

  /**
   * Link OAuth account to existing user
   */
  async linkOAuthAccount(userId: string, provider: OAuthProvider, token: string): Promise<void> {
    let profile: OAuthUserProfile

    // Verify token and get profile
    if (provider === OAuthProvider.GOOGLE) {
      profile = await this.verifyGoogleToken(token)
    } else if (provider === OAuthProvider.GITHUB) {
      profile = await this.verifyGitHubCode(token)
    } else {
      throw new BadRequestException('Unsupported OAuth provider')
    }

    // Check if this OAuth account is already linked to another user
    const existingAccount = await this.data.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
    })

    if (existingAccount) {
      if (existingAccount.userId === userId) {
        throw new ConflictException('This OAuth account is already linked to your account')
      }
      throw new ConflictException('This OAuth account is already linked to another user')
    }

    // Create OAuth account link
    await this.data.oAuthAccount.create({
      data: {
        provider,
        providerUserId: profile.providerUserId,
        userId,
      },
    })
  }

  /**
   * Unlink OAuth account from user
   */
  async unlinkOAuthAccount(userId: string, provider: OAuthProvider): Promise<void> {
    const user = await this.data.user.findUnique({
      where: { id: userId },
      include: {
        oAuthAccounts: true,
      },
    })

    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    // Ensure user has a password or another OAuth provider before unlinking
    if (!user.password && user.oAuthAccounts.length <= 1) {
      throw new BadRequestException(
        'Cannot unlink the only authentication method. Please set a password first.',
      )
    }

    const account = user.oAuthAccounts.find(acc => acc.provider === provider)
    if (!account) {
      throw new BadRequestException('OAuth account not linked')
    }

    await this.data.oAuthAccount.delete({
      where: {
        id: account.id,
      },
    })
  }

  /**
   * Find or create user from OAuth profile
   * Used during OAuth login flow
   */
  async findOrCreateUserFromOAuth(profile: OAuthUserProfile, organizationId?: string) {
    // Check if OAuth account already exists
    let oAuthAccount = await this.data.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: {
        user: true,
      },
    })

    // If OAuth account exists, return the user
    if (oAuthAccount) {
      return oAuthAccount.user
    }

    // Check if user exists with this email
    let user = await this.data.user.findFirst({
      where: {
        emails: {
          some: {
            email: {
              equals: profile.email,
              mode: 'insensitive',
            },
          },
        },
      },
    })

    // If user doesn't exist, create new user
    if (!user) {
      // Generate unique display name from email
      const baseDisplayName = profile.name || profile.email.split('@')[0]
      let displayName = baseDisplayName
      let counter = 1

      // Ensure display name is unique
      while (await this.data.user.findUnique({ where: { displayName } })) {
        displayName = `${baseDisplayName}${counter}`
        counter++
      }

      user = await this.data.user.create({
        data: {
          displayName,
          emailValidated: true, // OAuth emails are pre-verified
          emails: {
            create: {
              email: profile.email,
              primary: true,
              verified: true,
              emailType: 'PERSONAL',
            },
          },
          // No password for OAuth-only users
        },
      })

      // Create organization membership if organizationId provided
      if (organizationId) {
        // Get the default "Member" role for this organization
        const memberRole = await this.data.role.findFirst({
          where: {
            name: 'Member',
            organizationId,
          },
        })

        if (memberRole) {
          await this.data.organizationMember.create({
            data: {
              userId: user.id,
              organizationId,
              roleId: memberRole.id,
            },
          })
        }
      }
    }

    // Link OAuth account to user
    await this.data.oAuthAccount.create({
      data: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        userId: user.id,
      },
    })

    return user
  }
}
