import 'dotenv/config'
import * as path from 'node:path'
import { defineConfig } from 'prisma/config'

// Use process.env with fallback for CI where DATABASE_URL may not be set during prisma generate
// The fallback URL is only used for schema parsing, not actual database connections
const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder'

// Safety guard: `migrate dev` and `migrate reset` are destructive development-only
// commands — they can drop and recreate the database — so they may only ever run
// against a local database, no matter what DATABASE_URL happens to be set to.
// `prisma migrate deploy` is the supported path for remote environments and is unaffected.
// This file executes on every Prisma CLI invocation, so the guard cannot be bypassed
// by ambient env vars, agent error, or a typo.
const migrateIndex = process.argv.indexOf('migrate')
const migrateSubcommand = migrateIndex === -1 ? undefined : process.argv[migrateIndex + 1]
if (migrateSubcommand === 'dev' || migrateSubcommand === 'reset') {
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  let hostname: string
  try {
    hostname = new URL(databaseUrl).hostname
  } catch {
    throw new Error(`BLOCKED: prisma migrate ${migrateSubcommand} — DATABASE_URL is not a parseable URL.`)
  }
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `BLOCKED: prisma migrate ${migrateSubcommand} against non-local database host "${hostname}".\n` +
        `migrate dev/reset can drop and recreate the database, so they may only run against localhost.\n` +
        `Start the local dev database (docker compose -f .dev/docker-compose.yml up -d postgres) and point\n` +
        `DATABASE_URL at it, or use "prisma migrate deploy" to apply committed migrations to a remote environment.`,
    )
  }
}

export default defineConfig({
  schema: path.join('libs', 'api', 'prisma', 'src', 'lib', 'schemas'),
  migrations: {
    path: path.join('libs', 'api', 'prisma', 'src', 'lib', 'migrations'),
    seed: 'tsx libs/api/prisma/src/lib/seed/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
})
