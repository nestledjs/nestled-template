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
  const user = { update: jest.fn().mockResolvedValue({}) }
  const transaction: EmailTransaction = { email, user }
  const data: EmailDataAccess = {
    $transaction: callback => callback(transaction),
  }

  return { email, user, service: new StaffEmailService(data) }
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

  it('stores a changed address unverified, whatever the input says, and drops its pending token', async () => {
    const { email, service } = createFixture()
    email.findUnique.mockResolvedValue(
      buildEmail({ verifyToken: 'pending', verifyExpires: new Date('2026-12-01') }),
    )
    email.update.mockResolvedValue(buildEmail())

    await service.staffUpdateEmail('email-1', { email: 'new@example.com', verified: true })

    expect(email.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: {
        email: 'new@example.com',
        verified: false,
        verifyToken: null,
        verifyExpires: null,
      },
    })
  })

  it('does not make a changed address primary, since it starts unverified', async () => {
    const { email, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail())

    await expect(
      service.staffUpdateEmail('email-1', {
        email: 'new@example.com',
        verified: true,
        primary: true,
      }),
    ).rejects.toThrow('Cannot set an unverified email as primary')
    expect(email.update).not.toHaveBeenCalled()
  })

  it('leaves verification alone when the address is unchanged apart from case and spacing', async () => {
    const { email, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail())
    email.update.mockResolvedValue(buildEmail())

    await service.staffUpdateEmail('email-1', { email: ' User@Example.com ', public: true })

    expect(email.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: { email: ' User@Example.com ', public: true },
    })
  })

  it('refuses to change or unverify a primary address', async () => {
    const { email, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail({ primary: true }))

    await expect(
      service.staffUpdateEmail('email-1', { email: 'new@example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.staffUpdateEmail('email-1', { verified: false })).rejects.toThrow(
      'A primary email cannot be changed or unverified',
    )
    expect(email.update).not.toHaveBeenCalled()
  })

  it('keeps emailValidated in step when the primary is verified, writing the User row first', async () => {
    const { email, user, service } = createFixture()
    const order: string[] = []
    user.update.mockImplementation(async (args: { data: object }) => {
      order.push(`user:${Object.keys(args.data).join(',')}`)
      return {}
    })
    email.update.mockImplementation(async () => {
      order.push('email')
      return buildEmail({ primary: true, verified: true })
    })
    email.findUnique.mockResolvedValue(buildEmail({ primary: true, verified: false }))
    email.findFirst.mockResolvedValue(buildEmail({ primary: true, verified: true }))

    await service.staffUpdateEmail('email-1', { verified: true })

    expect(order).toEqual(['user:updatedAt', 'email', 'user:emailValidated'])
    expect(user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { emailValidated: true },
    })
  })

  it('sets emailValidated from the new primary when a verified address is promoted', async () => {
    const { email, user, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail({ verified: true }))
    email.updateMany.mockResolvedValue({ count: 1 })
    email.update.mockResolvedValue(buildEmail({ primary: true }))
    email.findFirst.mockResolvedValue(buildEmail({ primary: true, verified: true }))

    await service.staffUpdateEmail('email-1', { primary: true })

    expect(user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { emailValidated: true },
    })
  })

  it('clears emailValidated when the account is left with no verified primary', async () => {
    const { email, user, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail({ primary: true }))
    email.update.mockResolvedValue(buildEmail({ primary: false }))
    email.findFirst.mockResolvedValue(null)

    await service.staffUpdateEmail('email-1', { primary: false })

    expect(user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { emailValidated: false },
    })
  })

  it('touches no User row for an organization address', async () => {
    const { email, user, service } = createFixture()
    email.findUnique.mockResolvedValue(buildEmail({ userId: null, organizationId: 'org-1' }))
    email.update.mockResolvedValue(buildEmail())

    await service.staffUpdateEmail('email-1', { public: true })

    expect(user.update).not.toHaveBeenCalled()
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

  it('sets emailValidated from the promoted replacement when a primary is deleted', async () => {
    const { email, user, service } = createFixture()
    const current = buildEmail({ primary: true, verified: false })
    const replacement = buildEmail({ id: 'email-2', primary: false, verified: true })
    email.findUnique.mockResolvedValue(current)
    // First lookup: the replacement to promote. Second: the primary after the delete.
    email.findFirst
      .mockResolvedValueOnce(replacement)
      .mockResolvedValueOnce({ ...replacement, primary: true })
    email.update.mockResolvedValue({ ...replacement, primary: true })
    email.delete.mockResolvedValue(current)

    await service.staffDeleteEmail(current.id)

    expect(user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user-1' },
      data: { updatedAt: expect.any(Date) },
    })
    expect(user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { emailValidated: true },
    })
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
