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

/** One entry of a GraphQL response's `errors` array. */
export interface GraphQLErrorResponse {
  message: string
  extensions?: Record<string, unknown>
  path?: readonly (string | number)[]
}

/** The body of a GraphQL response: `data` shaped like the operation's selection set. */
export interface GraphQLResponse<TData> {
  data: TData
  errors?: GraphQLErrorResponse[]
}

export type GraphQLVariables = Record<string, unknown>

export interface UserEmail {
  email: string
  primary: boolean
}

export interface AuthUser {
  id: string
  firstName: string
  lastName: string
  emails?: UserEmail[]
  emailValidated: boolean
}

export interface AuthPayload {
  token: string
  user: AuthUser
}

export interface VerifiedEmail {
  id: string
  emailValidated: boolean
}

export interface ResetPasswordResult {
  id: string
  email: string
}

export type CurrentUser = AuthUser & { email: string | undefined }

export class TestHelpers {
  private static readonly baseURL = axios.defaults.baseURL || 'http://localhost:3000'

  // GraphQL helper
  // Pass the operation's data type: graphql<{ me: { id: string } }>(query).
  static async graphql<TData = unknown>(
    query: string,
    variables?: GraphQLVariables,
  ): Promise<AxiosResponse<GraphQLResponse<TData>>> {
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

    const response = await this.graphql<{ register: AuthPayload }>(registerMutation, {
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
    const primaryEmail = result.user.emails?.find(e => e.primary)?.email || user.email
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

  static async loginUser(email: string, password = 'TestPassword123!'): Promise<TestUser> {
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

    const response = await this.graphql<{ login: AuthPayload }>(loginMutation, {
      input: { email, password },
    })

    if (response.data.errors) {
      throw new Error(`Login failed: ${JSON.stringify(response.data.errors)}`)
    }

    const result = response.data.data.login
    const primaryEmail = result.user.emails?.find(e => e.primary)?.email || email
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

  static async verifyEmail(token: string): Promise<VerifiedEmail> {
    const verifyMutation = `
      mutation VerifyEmail($input: VerifyEmailInput!) {
        verifyEmail(input: $input) {
          id
          emailValidated
        }
      }
    `

    const response = await this.graphql<{ verifyEmail: VerifiedEmail }>(verifyMutation, {
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

    const response = await this.graphql<{ forgotPassword: boolean }>(forgotPasswordMutation, {
      input: { email },
    })

    if (response.data.errors) {
      throw new Error(`Password reset request failed: ${JSON.stringify(response.data.errors)}`)
    }

    return response.data.data.forgotPassword
  }

  static async resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
    const resetPasswordMutation = `
      mutation ResetPassword($input: ResetPasswordInput!) {
        resetPassword(input: $input) {
          id
          email
        }
      }
    `

    const response = await this.graphql<{ resetPassword: ResetPasswordResult }>(
      resetPasswordMutation,
      {
        input: { token, password: newPassword },
      },
    )

    if (response.data.errors) {
      throw new Error(`Password reset failed: ${JSON.stringify(response.data.errors)}`)
    }

    return response.data.data.resetPassword
  }

  // Authenticated requests helper
  static async authenticatedGraphql<TData = unknown>(
    query: string,
    user: TestUser,
    variables?: GraphQLVariables,
  ): Promise<AxiosResponse<GraphQLResponse<TData>>> {
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

  static async getCurrentUser(user: TestUser): Promise<CurrentUser> {
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

    const response = await this.authenticatedGraphql<{ me: AuthUser }>(meQuery, user)

    if (response.data.errors) {
      throw new Error(`Get current user failed: ${JSON.stringify(response.data.errors)}`)
    }

    const result = response.data.data.me
    const primaryEmail = result.emails?.find(e => e.primary)?.email

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

  static generateTestEmail(prefix = 'test'): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    return `${prefix}-${timestamp}-${random}@example.com`
  }
}
