import { BadRequestException } from '@nestjs/common'
import { Email, EmailType } from '@nestled-template/api/prisma'
import { EmailDataAccess, EmailTransaction, StaffEmailService } from './email.service'

const buildEmail = (overrides: Partial<Email> = {}): Email => ({
  id: 'email-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  email: 'user@example.com',
  public: false,
  primary: false,
  verified: true,
  verifyToken: null,
  verifyExpires: null,
  userId: 'user-1',
  emailType: EmailType.WORK,
  organizationId: null,
  ...overrides,
})

const createFixture = () => {
  const email = {
    delete: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  }
  const transaction: EmailTransaction = { email }
  const data: EmailDataAccess = {
    $transaction: callback => callback(transaction),
  }

  return { email, service: new StaffEmailService(data) }
}

describe('StaffEmailService', () => {
  it('updates through explicit Prisma data and demotes the existing primary', async () => {
    const { email, service } = createFixture()
    const current = buildEmail()
    const updated = buildEmail({ primary: true })
    email.findUnique.mockResolvedValue(current)
    email.updateMany.mockResolvedValue({ count: 1 })
    email.update.mockResolvedValue(updated)

    await expect(service.staffUpdateEmail(current.id, { primary: true })).resolves.toBe(updated)
    expect(email.updateMany).toHaveBeenCalledWith({
      where: { userId: current.userId, primary: true, NOT: { id: current.id } },
      data: { primary: false },
    })
    expect(email.update).toHaveBeenCalledWith({
      where: { id: current.id },
      data: { primary: true },
    })
  })

  it('rejects promotion of an unverified email', async () => {
    const { email, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail({ verified: false }))

    await expect(service.staffUpdateEmail('email-1', { primary: true })).rejects.toThrow(
      'Cannot set an unverified email as primary',
    )
    expect(email.update).not.toHaveBeenCalled()
  })

  it('promotes a verified replacement before deleting a primary email', async () => {
    const { email, service } = createFixture()
    const current = buildEmail({ primary: true })
    const replacement = buildEmail({ id: 'email-2', primary: false })
    email.findUnique.mockResolvedValue(current)
    email.findFirst.mockResolvedValue(replacement)
    email.update.mockResolvedValue({ ...replacement, primary: true })
    email.delete.mockResolvedValue(current)

    await expect(service.staffDeleteEmail(current.id)).resolves.toBe(current)
    expect(email.findFirst).toHaveBeenCalledWith({
      where: { userId: current.userId, verified: true, NOT: { id: current.id } },
      orderBy: { createdAt: 'asc' },
    })
    expect(email.update).toHaveBeenCalledWith({
      where: { id: replacement.id },
      data: { primary: true },
    })
    expect(email.delete).toHaveBeenCalledWith({ where: { id: current.id } })
  })

  it('rejects deletion when a primary email has no verified replacement', async () => {
    const { email, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail({ primary: true }))
    email.findFirst.mockResolvedValue(null)

    await expect(service.staffDeleteEmail('email-1')).rejects.toThrow(
      'Cannot delete primary email when no other verified emails exist',
    )
    expect(email.delete).not.toHaveBeenCalled()
  })

  it('fails closed when the target email does not exist', async () => {
    const { email, service } = createFixture()
    email.findUnique.mockResolvedValue(null)

    await expect(service.staffDeleteEmail('missing')).rejects.toBeInstanceOf(BadRequestException)
  })
})
