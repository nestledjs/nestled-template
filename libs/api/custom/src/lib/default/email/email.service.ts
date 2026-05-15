import { BadRequestException, Injectable } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { UpdateEmailInput } from '@nestled-template/api/generated-crud/data-access'

@Injectable()
export class EmailService {
  constructor(private readonly data: ApiCoreDataAccessService) {}

  async validateEmailUpdate(emailId: string, input: UpdateEmailInput) {
    // If trying to set email as primary, it must be verified
    if (input.primary === true) {
      const email = await this.data.email.findUnique({
        where: { id: emailId }
      })

      if (!email) {
        throw new BadRequestException('Email not found')
      }

      // Check if the email being updated would be verified after the update
      const wouldBeVerified = input.verified !== undefined ? input.verified : email.verified

      if (!wouldBeVerified) {
        throw new BadRequestException(
          'Cannot set an unverified email as primary. Please verify the email first.'
        )
      }

      // If setting as primary, unset any existing primary emails for this user
      if (email.userId) {
        await this.data.email.updateMany({
          where: {
            userId: email.userId,
            primary: true,
            NOT: { id: emailId }
          },
          data: { primary: false }
        })
      } else if (email.organizationId) {
        await this.data.email.updateMany({
          where: {
            organizationId: email.organizationId,
            primary: true,
            NOT: { id: emailId }
          },
          data: { primary: false }
        })
      }
    }

    return true
  }

  async ensurePrimaryEmailExists(userId?: string, organizationId?: string) {
    if (!userId && !organizationId) return

    const where = userId ? { userId } : { organizationId }

    const primaryEmail = await this.data.email.findFirst({
      where: { ...where, primary: true }
    })

    // If no primary email exists, set the first verified email as primary
    if (!primaryEmail) {
      const firstVerified = await this.data.email.findFirst({
        where: { ...where, verified: true },
        orderBy: { createdAt: 'asc' }
      })

      if (firstVerified) {
        await this.data.email.update({
          where: { id: firstVerified.id },
          data: { primary: true }
        })
      }
    }
  }

  async validateEmailDeletion(emailId: string) {
    const email = await this.data.email.findUnique({
      where: { id: emailId }
    })

    if (!email) {
      throw new BadRequestException('Email not found')
    }

    // Prevent deleting the only primary email
    if (email.primary) {
      const where = email.userId ? { userId: email.userId } : { organizationId: email.organizationId }
      const emailCount = await this.data.email.count({ where })

      if (emailCount <= 1) {
        throw new BadRequestException(
          'Cannot delete the only email address. Add another email first.'
        )
      }

      // Before deleting, promote another verified email to primary
      if (where) {
        const nextEmail = await this.data.email.findFirst({
          where: {
            ...where,
            verified: true,
            NOT: { id: emailId }
          },
          orderBy: { createdAt: 'asc' }
        })

        if (nextEmail) {
          await this.data.email.update({
            where: { id: nextEmail.id },
            data: { primary: true }
          })
        } else {
          throw new BadRequestException(
            'Cannot delete primary email when no other verified emails exist. Add and verify another email first.'
          )
        }
      }
    }

    return true
  }
}