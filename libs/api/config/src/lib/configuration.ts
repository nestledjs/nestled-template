export const configuration = () => ({
  prefix: 'api',
  environment: process.env['NODE_ENV'],
  host: process.env['HOST'] ?? '0.0.0.0',
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  apiUrl: process.env['API_URL'],
  api: {
    cookie: {
      name: process.env['VITE_COOKIE_NAME'] ?? '__session',
      secret: process.env['API_COOKIE_SECRET'] ?? 'secret',
      options: {
        // Only set cookie domain if it is a valid registrable domain. Avoid 'localhost' or IPs.
        ...(() => {
          const dom = (process.env['API_COOKIE_DOMAIN'] ?? '').trim()
          if (!dom || dom === 'localhost' || dom === '127.0.0.1' || dom === '[::1]') {
            return {}
          }
          return { domain: dom }
        })(),
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
    cors: {
      origin: (process.env['ALLOWED_ORIGINS'] ?? '').split(',').map(o => o.trim()).filter(o => o.length > 0),
    },
  },
  siteUrl: process.env['SITE_URL'] ?? process.env['API_URL']?.replace('/api', ''),
  app: {
    email: process.env['APP_EMAIL'],
    supportEmail: process.env['APP_SUPPORT_EMAIL'],
    adminEmails: process.env['APP_ADMIN_EMAILS'],
    name: process.env['APP_NAME'],
  },
  email: {
    provider: process.env['EMAIL_PROVIDER'] ?? 'smtp',
  },
  smtp: {
    host: process.env['SMTP_HOST'],
    port: process.env['SMTP_PORT'],
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
  },
  twoFactor: {
    // Issuer name shown in authenticator apps
    issuer: process.env['TWO_FACTOR_ISSUER'] ?? process.env['APP_NAME'] ?? 'MyApp',
    // Window for time drift (in 30-second increments, 2 = 60 seconds tolerance)
    window: parseInt(process.env['TWO_FACTOR_WINDOW'] ?? '2', 10),
    // Encryption key for storing secrets (should be 32 characters)
    encryptionKey: process.env['TWO_FACTOR_ENCRYPTION_KEY'] ?? process.env['JWT_SECRET'],
  },
  oauth: {
    google: {
      clientId: process.env['GOOGLE_OAUTH_CLIENT_ID'],
      clientSecret: process.env['GOOGLE_OAUTH_CLIENT_SECRET'],
      enabled: !!(process.env['GOOGLE_OAUTH_CLIENT_ID'] && process.env['GOOGLE_OAUTH_CLIENT_SECRET']),
    },
    github: {
      clientId: process.env['GITHUB_OAUTH_CLIENT_ID'],
      clientSecret: process.env['GITHUB_OAUTH_CLIENT_SECRET'],
      enabled: !!(process.env['GITHUB_OAUTH_CLIENT_ID'] && process.env['GITHUB_OAUTH_CLIENT_SECRET']),
    },
  },
})
