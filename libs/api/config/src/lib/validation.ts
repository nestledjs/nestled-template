import * as Joi from 'joi'
import { defaultApiOrigin, isHttpOrigin, normalizeApiOrigin } from './api-url'

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test'),
  HOST: Joi.alternatives()
    .try(
      Joi.string().ip(), // Allow IP addresses like 0.0.0.0, 127.0.0.1
      Joi.string().hostname(), // Allow hostnames like localhost, example.com
    )
    .default('localhost'),
  PORT: Joi.number().default(3000),
  WEB_PORT: Joi.number().default(4200),
  WEB_URL: Joi.string().default(
    `http://${process.env['HOST'] || 'localhost'}:${process.env['WEB_PORT']}`,
  ),
  API_COOKIE_DOMAIN: Joi.string().default('localhost'),
  VITE_COOKIE_NAME: Joi.string().default('__session'),
  // API_URL is the origin only, WITHOUT the `/api` global prefix. The prefix is appended by the
  // URL-building code (OAuth redirect_uri, MCP base URL, upload public URLs). Keep this consistent
  // with .env.example and docs/template/README.md — a `/api` suffix here breaks all of those.
  // Normalize (trim, strip trailing slash + `/api`) so a misconfigured env self-heals, and fail
  // fast when the value is not an http(s) origin. The default interpolates PORT with a 3000 fallback
  // so an unset PORT never yields `http://localhost:undefined`.
  API_URL: Joi.string()
    .default(defaultApiOrigin(process.env['HOST'], process.env['PORT']))
    .custom((value, helpers) => {
      const normalized = normalizeApiOrigin(value, {
        host: process.env['HOST'],
        port: process.env['PORT'],
      })
      return isHttpOrigin(normalized) ? normalized : helpers.error('any.invalid')
    }, 'origin-only API_URL'),
  APP_NAME: Joi.string().default('BizToBiz'), // Made optional with default
  APP_EMAIL: Joi.string().email().default('admin@example.com'), // Made optional with default
  APP_SUPPORT_EMAIL: Joi.string().email().default('support@example.com'), // Made optional with default
  APP_ADMIN_EMAILS: Joi.string().default('admin@example.com'), // Made optional with default
  SITE_URL: Joi.string().uri().default('http://localhost:4200'), // Made optional with default
  SMTP_HOST: Joi.string().default('localhost'), // Made optional with default
  SMTP_PORT: Joi.string().default('587'), // Made optional with default
  SMTP_USER: Joi.string().default('user'), // Made optional with default
  SMTP_PASS: Joi.string().default('pass'), // Made optional with default
})
