import { faker } from '@faker-js/faker'

export interface CreateUserData {
  firstName?: string
  lastName?: string
  email?: string
  password?: string
  organizationName?: string
  verified?: boolean
}

export class UserFactory {
  static create(overrides: CreateUserData = {}): Required<CreateUserData> {
    return {
      firstName: overrides.firstName ?? faker.person.firstName(),
      lastName: overrides.lastName ?? faker.person.lastName(),
      email: overrides.email ?? faker.internet.email().toLowerCase(),
      password: overrides.password ?? 'TestPassword123!',
      organizationName: overrides.organizationName ?? faker.company.name(),
      verified: overrides.verified ?? false,
    }
  }

  static createMany(count: number, overrides: CreateUserData = {}): Required<CreateUserData>[] {
    return Array.from({ length: count }, () => this.create(overrides))
  }

  // Create specific user types
  static createAdmin(overrides: CreateUserData = {}): Required<CreateUserData> {
    return this.create({
      ...overrides,
      email: overrides.email ?? 'admin@example.com',
      verified: true,
    })
  }

  static createVerifiedUser(overrides: CreateUserData = {}): Required<CreateUserData> {
    return this.create({
      ...overrides,
      verified: true,
    })
  }

  static createUnverifiedUser(overrides: CreateUserData = {}): Required<CreateUserData> {
    return this.create({
      ...overrides,
      verified: false,
    })
  }
}
