import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ApiCoreDataAccessService } from '@nestled-template/api/core/data-access'
import { Email, Prisma } from '@nestled-template/api/prisma'
import { StaffUpdateEmailInput } from './dto'
import { normalizeEmail } from '../../plugins/auth/auth.helper'

const ownerWhereFor = (email: Email): Prisma.EmailWhereInput | undefined => {
  if (email.userId) return { userId: email.userId }
  if (email.organizationId) return { organizationId: email.organizationId }
  return undefined
}

type EmailUpdateData =
  (StaffUpdateEmailInput & { verifyToken?: null; verifyExpires?: null }) | { primary: boolean }

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
  user: {
    update(args: {
      where: { id: string }
      data: { updatedAt: Date } | { emailValidated: boolean }
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
      const data = this.updateDataFor(email, input)
      await this.lockOwningUser(transaction, email)

      if (input.primary === true) {
        this.assertVerifiedPrimary(email, data)
        const ownerWhere = ownerWhereFor(email)
        if (ownerWhere) {
          await transaction.email.updateMany({
            where: { ...ownerWhere, primary: true, NOT: { id: emailId } },
            data: { primary: false },
          })
        }
      }

      const updated = await transaction.email.update({ where: { id: emailId }, data })
      await this.syncEmailValidated(transaction, email)
      return updated
    })
  }

  /**
   * A changed address has not been verified by anyone, so it starts unverified and loses any
   * pending verification token, whatever the input says. A primary address can be neither changed
   * nor unverified here: add and verify another address, make it primary, then edit this one.
   */
  private updateDataFor(email: Email, input: StaffUpdateEmailInput) {
    const addressChanged =
      input.email !== undefined && normalizeEmail(input.email) !== normalizeEmail(email.email)

    if (email.primary && (addressChanged || input.verified === false)) {
      throw new BadRequestException(
        'A primary email cannot be changed or unverified. Add and verify another email, make it primary, then edit this one.',
      )
    }

    return addressChanged
      ? { ...input, verified: false, verifyToken: null, verifyExpires: null }
      : input
  }

  async staffDeleteEmail(emailId: string): Promise<Email> {
    return this.data.$transaction(async transaction => {
      const email = await this.requireEmail(transaction, emailId)
      await this.lockOwningUser(transaction, email)
      if (email.primary) await this.promoteReplacementEmail(transaction, email)
      const deleted = await transaction.email.delete({ where: { id: emailId } })
      await this.syncEmailValidated(transaction, email)
      return deleted
    })
  }

  /**
   * Write the owning User row before any Email row, the lock order changeEmail() and the
   * verification paths use, so concurrent changes to one account serialize.
   */
  private async lockOwningUser(transaction: EmailTransaction, email: Email): Promise<void> {
    if (!email.userId) return
    await transaction.user.update({ where: { id: email.userId }, data: { updatedAt: new Date() } })
  }

  /**
   * `User.emailValidated` describes the primary address. After any change to which address is
   * primary or whether it is verified, set it from the primary as it now stands.
   */
  private async syncEmailValidated(transaction: EmailTransaction, email: Email): Promise<void> {
    if (!email.userId) return
    const primary = await transaction.email.findFirst({
      where: { userId: email.userId, primary: true },
      orderBy: { createdAt: 'asc' },
    })
    await transaction.user.update({
      where: { id: email.userId },
      data: { emailValidated: primary?.verified === true },
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
