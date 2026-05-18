import { ConfigService } from '@nestled-template/api/config'
import { EmailService } from './email.service'

function createConfig(provider = 'mock'): ConfigService {
  return {
    appName: 'Nestled',
    appEmail: 'hello@example.com',
    appSupportEmail: 'support@example.com',
    emailProvider: provider,
    siteUrl: 'https://app.example.com',
  } as ConfigService
}

describe('EmailService', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    jest.spyOn(Math, 'random').mockReturnValue(0.123456)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sends plain emails with configured defaults', async () => {
    const service = new EmailService(createConfig())

    const result = await service.sendEmail({
      to: ['ada@example.com', 'grace@example.com'],
      subject: 'Hello',
      text: 'Welcome',
    })

    expect(result.accepted).toEqual(['ada@example.com', 'grace@example.com'])
    expect(result.rejected).toEqual([])
    expect(result.response).toBe('250 Mock email accepted')
  })

  it('sends templated emails through the configured provider', async () => {
    const service = new EmailService(createConfig())

    const result = await service.sendTemplate('ada@example.com', {
      templateId: 'welcome',
      variables: { userName: 'Ada', appName: 'Nestled' },
    })

    expect(result.accepted).toEqual(['ada@example.com'])
    expect(result.response).toBe('250 Mock templated email accepted')
  })

  it('builds password reset, verification, invitation, and welcome workflows', async () => {
    const service = new EmailService(createConfig())

    await expect(
      service.sendPasswordResetEmail('ada@example.com', 'reset-token', 'Ada'),
    ).resolves.toMatchObject({ accepted: ['ada@example.com'] })
    await expect(
      service.sendEmailVerification('ada@example.com', 'verify-token', 'Ada'),
    ).resolves.toMatchObject({ accepted: ['ada@example.com'] })
    await expect(
      service.sendInvitationEmail('ada@example.com', 'Grace', 'Example Org', 'invite-token'),
    ).resolves.toMatchObject({ accepted: ['ada@example.com'] })
    await expect(service.sendWelcomeEmail('ada@example.com', 'Ada')).resolves.toMatchObject({
      accepted: ['ada@example.com'],
    })
  })

  it('validates the provider connection and rejects unsupported providers', async () => {
    const service = new EmailService(createConfig())

    await expect(service.testConnection()).resolves.toBe(true)
    expect(() => new EmailService(createConfig('unsupported'))).toThrow(
      'Unsupported email provider: unsupported',
    )
  })
})
