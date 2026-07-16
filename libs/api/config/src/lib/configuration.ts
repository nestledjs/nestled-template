import { normalizeApiOrigin } from './api-url'

// Treat unset OR `.env.example` placeholder values (e.g. `your-google-client-id`) as "not
// configured", so a plain `cp .env.example .env` does not falsely report OAuth as enabled. Trim
// once and test the TRIMMED value for both conditions — otherwise a copy-pasted value with leading
// whitespace (` your-google-client-id`) would slip past the placeholder check and falsely enable
// OAuth with placeholder credentials.
const isConfigured = (value: string | undefined): boolean => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 && !trimmed.startsWith('your-')
}

// Parse a boolean-ish env var. Unset/empty falls back to the supplied default, so callers can
// express "on in production, off in test" without every call site re-deriving NODE_ENV.
const envBool = (value: string | undefined, fallback: boolean): boolean => {
  const trimmed = value?.trim().toLowerCase() ?? ''
  if (trimmed.length === 0) return fallback
  return trimmed === 'true' || trimmed === '1'
}

// Parse a non-negative integer env var, falling back on anything unparseable. Plain
// `Number.parseInt` yields NaN for a typo'd value, and NaN survives `??`, so a fat-fingered
// TRUST_PROXY_HOPS would otherwise reach `app.set('trust proxy', NaN)` and silently misconfigure
// the client-IP derivation the signup rate limit depends on.
const envInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value?.trim() ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

// Origin-only, self-healing API URL (see api-url.ts). configuration() reads process.env directly
// rather than the Joi-validated value, so normalize here too — not just in validation.ts.
const apiOrigin = () =>
  normalizeApiOrigin(process.env['API_URL'], {
    host: process.env['HOST'],
    port: process.env['PORT'],
  })

export const configuration = () => ({
  prefix: 'api',
  environment: process.env['NODE_ENV'],
  host: process.env['HOST'] ?? '0.0.0.0',
  port: Number.parseInt(process.env['PORT'] ?? '3000', 10),
  apiUrl: apiOrigin(),
  // Number of reverse proxies in front of the API, handed to Express's `trust proxy`. This decides
  // how much of `X-Forwarded-For` is believed when computing `req.ip`, which the signup rate limit
  // keys on — so it is a security setting, not a cosmetic one:
  //   too low  => every request looks like it came from the proxy, one shared bucket for all users
  //   too high => clients can forge `X-Forwarded-For` and mint a fresh bucket per request
  // Defaults to 0 (no proxy, correct for local dev). Railway/Heroku/Fly put exactly one hop in
  // front, so those deployments want 1. main.ts warns at boot if this is 0 in production.
  trustProxyHops: envInt(process.env['TRUST_PROXY_HOPS'], 0),
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
      origin: (process.env['ALLOWED_ORIGINS'] ?? '')
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0),
    },
  },
  siteUrl: process.env['SITE_URL'] ?? apiOrigin(),
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
    window: Number.parseInt(process.env['TWO_FACTOR_WINDOW'] ?? '2', 10),
    // Encryption key for storing secrets (should be 32 characters)
    encryptionKey: process.env['TWO_FACTOR_ENCRYPTION_KEY'] ?? process.env['JWT_SECRET'],
  },
  oauth: {
    google: {
      clientId: process.env['GOOGLE_OAUTH_CLIENT_ID'],
      clientSecret: process.env['GOOGLE_OAUTH_CLIENT_SECRET'],
      enabled:
        isConfigured(process.env['GOOGLE_OAUTH_CLIENT_ID']) &&
        isConfigured(process.env['GOOGLE_OAUTH_CLIENT_SECRET']),
    },
    github: {
      clientId: process.env['GITHUB_OAUTH_CLIENT_ID'],
      clientSecret: process.env['GITHUB_OAUTH_CLIENT_SECRET'],
      enabled:
        isConfigured(process.env['GITHUB_OAUTH_CLIENT_ID']) &&
        isConfigured(process.env['GITHUB_OAUTH_CLIENT_SECRET']),
    },
  },
  // Abuse controls for the unauthenticated signup surface (register, resendVerificationEmail).
  // Every check here runs BEFORE any outbound mail: the send is the abuse, so a gate that runs
  // after it protects nothing.
  signupProtection: {
    // Optional, like Stripe: absent secret key => disabled, and register accepts a missing token.
    turnstile: {
      secretKey: process.env['TURNSTILE_SECRET_KEY'],
      enabled: isConfigured(process.env['TURNSTILE_SECRET_KEY']),
    },
    throttle: {
      // Off under test so api-e2e can register many users from one IP without tripping the limit.
      enabled: envBool(process.env['SIGNUP_THROTTLE_ENABLED'], process.env['NODE_ENV'] !== 'test'),
      ttlSeconds: envInt(process.env['SIGNUP_THROTTLE_TTL'], 3600),
      limit: envInt(process.env['SIGNUP_THROTTLE_LIMIT'], 3),
    },
    // MX lookup costs a DNS round trip and fails for the fake domains dev/test fixtures use
    // (example.com publishes no MX record), so it defaults on only in production.
    requireMx: envBool(process.env['SIGNUP_REQUIRE_MX'], process.env['NODE_ENV'] === 'production'),
    mxTimeoutMs: envInt(process.env['SIGNUP_MX_TIMEOUT_MS'], 3000),
    // Static list, no network, no false positives on fixture domains — safe to default on.
    blockDisposable: envBool(process.env['SIGNUP_BLOCK_DISPOSABLE'], true),
  },
})
