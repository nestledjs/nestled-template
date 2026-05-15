import { Injectable, NotFoundException } from '@nestjs/common'
import { UserPreference } from '@nestled-template/api/prisma'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { SecureCreateUserPreferenceInput, SecureUpdateUserPreferenceInput } from './dto'

@Injectable()
export class UserPreferenceService {
  constructor(private readonly prisma: ApiCoreDataAccessService) {}

  async userCreateUserPreference(
    userId: string,
    input: SecureCreateUserPreferenceInput,
  ): Promise<UserPreference> {
    console.log('[UserPreferenceService] Creating preference:', {
      key: input.key,
      value: input.value,
      userId,
    })

    return this.prisma.userPreference.create({
      data: {
        key: input.key,
        value: input.value,
        user: {
          connect: { id: userId },
        },
      },
    })
  }

  async userUpdateUserPreference(
    userId: string,
    userPreferenceId: string,
    input: SecureUpdateUserPreferenceInput,
  ): Promise<UserPreference> {
    // Verify the preference belongs to the user
    const existing = await this.prisma.userPreference.findUnique({
      where: { id: userPreferenceId },
    })

    if (!existing) {
      throw new NotFoundException('User preference not found')
    }

    if (existing.userId !== userId) {
      throw new NotFoundException('User preference not found')
    }

    return this.prisma.userPreference.update({
      where: { id: userPreferenceId },
      data: {
        ...(input.key && { key: input.key }),
        ...(input.value && { value: input.value }),
      },
    })
  }

  async userDeleteUserPreference(
    userId: string,
    userPreferenceId: string,
  ): Promise<UserPreference> {
    // Verify the preference belongs to the user
    const existing = await this.prisma.userPreference.findUnique({
      where: { id: userPreferenceId },
    })

    if (!existing) {
      throw new NotFoundException('User preference not found')
    }

    if (existing.userId !== userId) {
      throw new NotFoundException('User preference not found')
    }

    return this.prisma.userPreference.delete({
      where: { id: userPreferenceId },
    })
  }

  async userGetUserPreference(
    userId: string,
    userPreferenceId: string,
  ): Promise<UserPreference | null> {
    const preference = await this.prisma.userPreference.findUnique({
      where: { id: userPreferenceId },
    })

    // Return null if not found or doesn't belong to user
    if (!preference || preference.userId !== userId) {
      return null
    }

    return preference
  }

  async userGetUserPreferences(userId: string): Promise<UserPreference[]> {
    return this.prisma.userPreference.findMany({
      where: { userId },
      orderBy: { key: 'asc' },
    })
  }
}