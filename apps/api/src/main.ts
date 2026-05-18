import 'dotenv/config' // Load environment variables before anything else
import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestled-template/api/config'
import cookieParser from 'cookie-parser'
import { graphqlUploadExpress } from 'graphql-upload-minimal'
import * as express from 'express'
import * as path from 'node:path'
import helmet from 'helmet'
import { NextFunction, Request, Response } from 'express'

import { AppModule } from './app.module'

const GLOBAL_PREFIX = 'api'

function getValidationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap(error => {
    const ownMessages = Object.values(error.constraints ?? {})
    const childMessages = getValidationMessages(error.children ?? [])
    return [...ownMessages, ...childMessages]
  })
}

// Known valid API prefixes - only actual REST endpoints
const VALID_API_PREFIXES = [
  '/graphql', // GraphQL endpoint
  '/api/uptime', // Core feature controller
  '/api/webhooks/stripe', // Stripe webhook
  '/api/auth', // OAuth controller (google/github)
  '/api/mcp', // MCP OAuth and tool endpoints
  '/uploads', // Static file uploads
]

// HTTP to HTTPS redirection middleware for Heroku/cloud deployments
const httpsRedirectMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Check if X-Forwarded-Proto header is set to http (Heroku/load balancer specific)
  if (req.headers['x-forwarded-proto'] === 'http') {
    const host = req.headers.host || req.hostname
    Logger.debug(`[HttpsRedirect] Redirecting to HTTPS: ${req.url}`)
    return res.redirect(301, `https://${host}${req.originalUrl}`)
  }
  return next()
}

// Early request filter middleware to reject invalid paths quickly
const earlyRequestFilter = (req: Request, res: Response, next: NextFunction) => {
  const path = req.path

  // Special cases that should always be allowed
  if (path === '/.well-known/apple-app-site-association') {
    return next()
  }

  // Check if it's a valid API or GraphQL path
  const isValidPath = VALID_API_PREFIXES.some(
    prefix => path.startsWith(prefix) || (req.baseUrl + path).startsWith(prefix),
  )

  if (!isValidPath) {
    Logger.debug(`[EarlyFilter] Rejecting request: ${path}`)
    res.status(404).json({
      statusCode: 404,
      message: `Cannot ${req.method} ${req.url}`,
      error: 'Not Found',
    })
    return
  }

  return next()
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable NestJS's default body parser for custom handling
    bodyParser: false,
  })
  app.enableShutdownHooks()

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false, // Allow fields without decorators (for generated DTOs)
      forbidNonWhitelisted: false,
      transform: true,
      skipMissingProperties: false, // Validate even if properties are present but empty
      forbidUnknownValues: false,
      exceptionFactory: errors => {
        const messages = getValidationMessages(errors)
        const message = messages[0] ?? 'Request validation failed'
        Logger.warn(`[ValidationPipe] ${messages.join('; ') || message}`)
        return new BadRequestException(message)
      },
    }),
  )

  const configService = app.get(ConfigService)

  // Get individual properties with fallbacks
  const port = configService.port || 3000
  const host = configService.host || 'localhost'

  // Add HTTPS redirection middleware first to ensure all requests are properly redirected
  app.use(httpsRedirectMiddleware)

  // Configure helmet with options that won't interfere with GraphQL or POST requests
  app.use(
    helmet({
      // Disable contentSecurityPolicy for GraphQL playground
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://cdn.jsdelivr.net',
          ],
          imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
        },
      },
      // Ensure compatibility with GraphQL subscriptions (WebSockets)
      crossOriginEmbedderPolicy: false,
      // Public uploads are served by the API and embedded by the web app on a different origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  // Set global prefix early, before request filtering
  app.setGlobalPrefix(GLOBAL_PREFIX)

  // Use the apiCorsOrigins getter and handle as array
  const origins = configService.apiCorsOrigins.length
    ? configService.apiCorsOrigins
    : ['http://localhost:4200']

  if (process.env['DEBUG_CONFIG'] === 'true') {
    Logger.debug(`CORS origins: ${JSON.stringify(origins)}`)
    Logger.debug(`Cookie config: ${JSON.stringify(configService.cookie)}`)
  }

  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (origins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error('Not allowed by CORS'))
    },
  })

  // Add early request filter after CORS is configured
  app.use(earlyRequestFilter)

  // Create body parsers once at startup (not per-request) for efficiency
  const stripeRawBodyParser = express.raw({
    type: 'application/json',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf
    },
  })
  const jsonBodyParser = express.json()

  // Custom body parsing logic
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.startsWith(`/${GLOBAL_PREFIX}/webhooks/stripe`)) {
      // For Stripe webhooks, use express.raw to preserve the raw body for HMAC verification
      stripeRawBodyParser(req, res, next)
    } else {
      // For all other routes, use the standard express.json parser
      jsonBodyParser(req, res, next)
    }
  })
  app.use(express.urlencoded({ extended: true }))

  // Additional security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Permissions-Policy',
      'interest-cohort=(), sync-xhr=(), document-domain=(), payment=()',
    )
    next()
  })

  app.use(cookieParser(configService.cookie.secret || 'secret'))

  // Serve uploaded files from local storage (only when no storage provider is configured)
  const storageProvider = configService.config.get<string>('STORAGE_PROVIDER')
  if (!storageProvider || storageProvider === 'local') {
    const uploadsPath = configService.config.get<string>('LOCAL_STORAGE_PATH') || './uploads'
    app.use('/uploads', express.static(path.resolve(uploadsPath)))
    Logger.log(`📁 Serving static files from: ${path.resolve(uploadsPath)}`)
  }

  // Configure graphql-upload middleware to handle multipart requests
  app.use('/graphql', graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 10 }))

  await app.listen(port, host, () => {
    Logger.log(`Listening at http://${host}:${port}/${GLOBAL_PREFIX}`)
    Logger.log(`Listening at http://${host}:${port}/graphql`)
  })
}

bootstrap().catch(error => {
  Logger.error('Failed to start the application', error)
  process.exit(1)
})

// Graceful shutdown for local dev restarts
process.once('SIGINT', async () => {
  try {
    await (globalThis as any).prisma?.$disconnect?.()
  } finally {
    process.exit(0)
  }
})
process.once('SIGTERM', async () => {
  try {
    await (globalThis as any).prisma?.$disconnect?.()
  } finally {
    process.exit(0)
  }
})
