export const configuration = () => ({
  prefix: 'api',
  environment: process.env['NODE_ENV'],
  host: process.env['HOST'],
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  apiUrl: process.env['API_URL'],
  api: {
    cookie: {
      name: process.env['VITE_COOKIE_NAME'] ?? '__session',
      options: {
        domain: process.env['API_COOKIE_DOMAIN'],
        httpOnly: true,
      },
    },
    cors: {
      origin: [process.env['WEB_URL']],
    },
  },
  siteUrl: process.env['SITE_URL'] || process.env['API_URL']?.replace('/api', ''),
  app: {
    email: process.env['APP_EMAIL'],
    supportEmail: process.env['APP_SUPPORT_EMAIL'],
    adminEmails: process.env['APP_ADMIN_EMAILS'],
    name: process.env['APP_NAME'],
  },
  smtp: {
    host: process.env['SMTP_HOST'],
    port: process.env['SMTP_PORT'],
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
  },
})
