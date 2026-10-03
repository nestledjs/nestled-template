export interface CreateUserData {
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  verified?: boolean
}

export class UserFactory {
  private static counter = 0

  static create(overrides: CreateUserData = {}): Required<CreateUserData> {
    UserFactory.counter++

    return {
      firstName: overrides.firstName ?? `FirstName${UserFactory.counter}`,
      lastName: overrides.lastName ?? `LastName${UserFactory.counter}`,
      email: overrides.email ?? `test${UserFactory.counter}@example.com`,
      password: overrides.password ?? 'TestPassword123!',
      verified: overrides.verified ?? false,
    }
  }

  static createMany(count: number, overrides: CreateUserData = {}): Required<CreateUserData>[] {
    return Array.from({ length: count }, () => this.create(overrides))
  }

  static createAdmin(overrides: CreateUserData = {}): Required<CreateUserData> {
    return this.create({
      ...overrides,
      verified: true,
    })
  }

  static createVerifiedUser(overrides: CreateUserData = {}): Required<CreateUserData> {
    return this.createAdmin(overrides)
  }

  static createUnverifiedUser(overrides: CreateUserData = {}): Required<CreateUserData> {
    return this.create({
      ...overrides,
      verified: false,
    })
  }
}
