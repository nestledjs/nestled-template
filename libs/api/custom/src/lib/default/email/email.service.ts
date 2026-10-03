import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { Email, Prisma } from '@nestled-template/api/prisma'
import { StaffUpdateEmailInput } from './dto'

const ownerWhereFor = (email: Email): Prisma.EmailWhereInput | undefined => {
  if (email.userId) return { userId: email.userId }
  if (email.organizationId) return { organizationId: email.organizationId }
  return undefined
}

type EmailUpdateData = StaffUpdateEmailInput | { primary: boolean }

export type EmailTransaction = {
  email: {
    delete(args: { where: { id: string } }): Promise<Email>
    findFirst(args: {
      where: Prisma.EmailWhereInput
      orderBy: { createdAt: 'asc' }
    }): Promise<Email | null>
    findUnique(args: { where: { id: string } }): Promise<Email | null>
    update(args: { where: { id: string }; data: EmailUpdateData }): Promise<Email>
    updateMany(args: {
      where: Prisma.EmailWhereInput
      data: { primary: boolean }
    }): Promise<unknown>
  }
}

export type EmailDataAccess = {
  $transaction<T>(callback: (transaction: EmailTransaction) => Promise<T>): Promise<T>
}

@Injectable()
export class StaffEmailService {
  constructor(
    @Inject(ApiCoreDataAccessService)
    private readonly data: EmailDataAccess,
  ) {}

  async staffUpdateEmail(emailId: string, input: StaffUpdateEmailInput): Promise<Email> {
    return this.data.$transaction(async transaction => {
      const email = await this.requireEmail(transaction, emailId)

      if (input.primary === true) {
        this.assertVerifiedPrimary(email, input)
        const ownerWhere = ownerWhereFor(email)
        if (ownerWhere) {
          await transaction.email.updateMany({
            where: { ...ownerWhere, primary: true, NOT: { id: emailId } },
            data: { primary: false },
          })
        }
      }

      return transaction.email.update({ where: { id: emailId }, data: input })
    })
  }

  async staffDeleteEmail(emailId: string): Promise<Email> {
    return this.data.$transaction(async transaction => {
      const email = await this.requireEmail(transaction, emailId)
      if (email.primary) await this.promoteReplacementEmail(transaction, email)
      return transaction.email.delete({ where: { id: emailId } })
    })
  }

  private async requireEmail(transaction: EmailTransaction, emailId: string): Promise<Email> {
    const email = await transaction.email.findUnique({ where: { id: emailId } })
    if (!email) throw new BadRequestException('Email not found')
    return email
  }

  private assertVerifiedPrimary(email: Email, input: StaffUpdateEmailInput): void {
    if (!(input.verified ?? email.verified)) {
      throw new BadRequestException(
        'Cannot set an unverified email as primary. Please verify the email first.',
      )
    }
  }

  private async promoteReplacementEmail(
    transaction: EmailTransaction,
    email: Email,
  ): Promise<void> {
    const ownerWhere = ownerWhereFor(email)
    if (!ownerWhere) return

    const replacement = await transaction.email.findFirst({
      where: { ...ownerWhere, verified: true, NOT: { id: email.id } },
      orderBy: { createdAt: 'asc' },
    })
    if (!replacement) {
      throw new BadRequestException(
        'Cannot delete primary email when no other verified emails exist. Add and verify another email first.',
      )
    }

    await transaction.email.update({
      where: { id: replacement.id },
      data: { primary: true },
    })
  }
}
