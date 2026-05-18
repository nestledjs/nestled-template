import axios, { AxiosResponse } from 'axios'
import { UserFactory, CreateUserData } from './factories/user.factory'

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
}

export interface TestUser {
  id: string
  email: string
  firstName: string
  lastName: string
  tokens?: AuthTokens
}

export class TestHelpers {
  private static readonly baseURL = axios.defaults.baseURL || 'http://localhost:3000'

  // GraphQL helper
  static async graphql<T = any>(
    query: string,
    variables?: any,
  ): Promise<AxiosResponse<{ data: T; errors?: any[] }>> {
    return axios.post(
      '/graphql',
      {
        query,
        variables,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }

  // Auth helpers
  static async registerUser(userData?: CreateUserData): Promise<TestUser> {
    const user = UserFactory.create(userData)

    const registerMutation = `
      mutation Register($input: RegisterInput!) {
        register(input: $input) {
          token
          user {
            id
            firstName
            lastName
            emails {
              email
              primary
            }
            emailValidated
          }
        }
      }
    `

    const response = await this.graphql(registerMutation, {
      input: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        password: user.password,
        organizationName: user.organizationName,
      },
    })

    if (response.data.errors) {
      throw new Error(`Registration failed: ${JSON.stringify(response.data.errors)}`)
    }

    const result = response.data.data.register
    const primaryEmail = result.user.emails?.find((e: any) => e.primary)?.email || user.email
    return {
      id: result.user.id,
      email: primaryEmail,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      tokens: {
        accessToken: result.token,
      },
    }
  }

  static async loginUser(email: string, password: string = 'TestPassword123!'): Promise<TestUser> {
    const loginMutation = `
      mutation Login($input: LoginInput!) {
        login(input: $input) {
          token
          user {
            id
            firstName
            lastName
            emails {
              email
              primary
            }
            emailValidated
          }
        }
      }
    `

    const response = await this.graphql(loginMutation, {
      input: { email, password },
    })

    if (response.data.errors) {
      throw new Error(`Login failed: ${JSON.stringify(response.data.errors)}`)
    }

    const result = response.data.data.login
    const primaryEmail = result.user.emails?.find((e: any) => e.primary)?.email || email
    return {
      id: result.user.id,
      email: primaryEmail,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      tokens: {
        accessToken: result.token,
      },
    }
  }

  static async verifyEmail(token: string): Promise<any> {
    const verifyMutation = `
      mutation VerifyEmail($input: VerifyEmailInput!) {
        verifyEmail(input: $input) {
          id
          emailValidated
        }
      }
    `

    const response = await this.graphql(verifyMutation, {
      input: { token },
    })

    if (response.data.errors) {
      throw new Error(`Email verification failed: ${JSON.stringify(response.data.errors)}`)
    }

    return response.data.data.verifyEmail
  }

  static async requestPasswordReset(email: string): Promise<boolean> {
    const forgotPasswordMutation = `
      mutation ForgotPassword($input: ForgotPasswordInput!) {
        forgotPassword(input: $input)
      }
    `

    const response = await this.graphql(forgotPasswordMutation, {
      input: { email },
    })

    if (response.data.errors) {
      throw new Error(`Password reset request failed: ${JSON.stringify(response.data.errors)}`)
    }

    return response.data.data.forgotPassword
  }

  static async resetPassword(token: string, newPassword: string): Promise<any> {
    const resetPasswordMutation = `
      mutation ResetPassword($input: ResetPasswordInput!) {
        resetPassword(input: $input) {
          id
          email
        }
      }
    `

    const response = await this.graphql(resetPasswordMutation, {
      input: { token, password: newPassword },
    })

    if (response.data.errors) {
      throw new Error(`Password reset failed: ${JSON.stringify(response.data.errors)}`)
    }

    return response.data.data.resetPassword
  }

  // Authenticated requests helper
  static async authenticatedGraphql<T = any>(
    query: string,
    user: TestUser,
    variables?: any,
  ): Promise<AxiosResponse<{ data: T; errors?: any[] }>> {
    return axios.post(
      '/graphql',
      {
        query,
        variables,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.tokens?.accessToken}`,
        },
      },
    )
  }

  static async getCurrentUser(user: TestUser): Promise<any> {
    const meQuery = `
      query Me {
        me {
          id
          firstName
          lastName
          emails {
            email
            primary
          }
          emailValidated
        }
      }
    `

    const response = await this.authenticatedGraphql(meQuery, user)

    if (response.data.errors) {
      throw new Error(`Get current user failed: ${JSON.stringify(response.data.errors)}`)
    }

    const result = response.data.data.me
    const primaryEmail = result.emails?.find((e: any) => e.primary)?.email

    return {
      ...result,
      email: primaryEmail,
    }
  }

  // Database cleanup helpers
  static async cleanupTestUsers(): Promise<void> {
    // This would require direct database access
    // For now, we rely on global teardown to reset the database
    console.log('Test users will be cleaned up in global teardown')
  }

  // Utility helpers
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  static generateTestEmail(prefix: string = 'test'): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    return `${prefix}-${timestamp}-${random}@example.com`
  }
}
