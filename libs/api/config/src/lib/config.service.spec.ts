import { ConfigService } from './config.service'

type ConfigStore = Record<string, unknown>

function createNestConfig(values: ConfigStore) {
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in values) || values[key] === undefined) {
        throw new Error(`Missing config: ${key}`)
      }
      return values[key]
    }),
  }
}

describe('ConfigService', () => {
  it('reads required application and API configuration', () => {
    const nestConfig = createNestConfig({
      environment: 'test',
      apiUrl: 'http://localhost:3000/graphql',
      'api.cors.origin': ['http://localhost:4200'],
      'api.cookie': { name: 'sid', secret: 'secret', options: { httpOnly: true } },
      prefix: 'api',
      port: 3000,
      host: '0.0.0.0',
      'app.email': 'hello@example.com',
      'app.supportEmail': 'support@example.com',
      'app.adminEmails': 'admin@example.com',
      'app.name': 'Nestled',
      siteUrl: 'https://app.example.com',
    })
    const service = new ConfigService(nestConfig as never)

    expect(service.environment).toBe('test')
    expect(service.apiUrl).toBe('http://localhost:3000/graphql')
    expect(service.apiCorsOrigins).toEqual(['http://localhost:4200'])
    expect(service.cookie).toEqual({ name: 'sid', secret: 'secret', options: { httpOnly: true } })
    expect(service.prefix).toBe('api')
    expect(service.port).toBe(3000)
    expect(service.host).toBe('0.0.0.0')
    expect(service.appEmail).toBe('hello@example.com')
    expect(service.appSupportEmail).toBe('support@example.com')
    expect(service.appAdminEmails).toBe('admin@example.com')
    expect(service.appName).toBe('Nestled')
    expect(service.siteUrl).toBe('https://app.example.com')
  })

  it('detects email provider from explicit config, SMTP config, or mock fallback', () => {
    expect(
      new ConfigService(createNestConfig({ 'email.provider': 'test' }) as never).emailProvider,
    ).toBe('test')
    expect(
      new ConfigService(createNestConfig({ 'smtp.host': 'smtp.example.com' }) as never)
        .emailProvider,
    ).toBe('smtp')
    expect(new ConfigService(createNestConfig({}) as never).emailProvider).toBe('mock')
  })

  it('builds optional integration configuration with defaults', () => {
    const service = new ConfigService(
      createNestConfig({
        'smtp.host': 'smtp.example.com',
        'smtp.port': 587,
        'smtp.secure': true,
        'smtp.user': 'user',
        'smtp.pass': 'pass',
        'twilio.accountSid': 'sid',
        'twilio.authToken': 'token',
        'twilio.fromNumber': '+15555550100',
        STRIPE_SECRET_KEY: 'sk_test',
        STRIPE_PUBLISHABLE_KEY: 'pk_test',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
      }) as never,
    )

    expect(service.mailerConfig).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: true,
      auth: { user: 'user', pass: 'pass' },
    })
    expect(service.twilio).toEqual({
      accountSid: 'sid',
      authToken: 'token',
      fromNumber: '+15555550100',
    })
    expect(service.stripe).toEqual({
      secretKey: 'sk_test',
      publishableKey: 'pk_test',
      webhookSecret: 'whsec_test',
      currency: 'usd',
    })
  })
})
