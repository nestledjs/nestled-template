import 'dotenv/config'
import * as path from 'node:path'
import { defineConfig } from 'prisma/config'

// The Prisma CLI (generate, db push, migrate, studio) connects through this datasource.
// Prefer DIRECT_URL when set — on Railway, DATABASE_URL is the pgbouncer/pooled URL and
// DIRECT_URL is the direct Postgres URL that migrations require — falling back to
// DATABASE_URL for local/single-host setups. This removes the manual DATABASE_URL swap
// that `prisma migrate deploy` used to need. The runtime app connects separately via the
// PrismaPg driver adapter using DATABASE_URL, so the pooled URL is still used for queries.
// The fallback placeholder is only for CI where no URL is set during `prisma generate`
// (schema parsing only, never an actual connection).
const databaseUrl =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  'postgresql://placeholder:placeholder@localhost:5432/placeholder'

// Safety guard: `migrate dev` and `migrate reset` are destructive development-only
// commands — they can drop and recreate the database — so they may only ever run
// against a local database, no matter what DIRECT_URL/DATABASE_URL happen to be set to.
// The guard validates the resolved connection above (DIRECT_URL preferred), which is the
// host these commands would actually connect to.
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
    throw new Error(
      `BLOCKED: prisma migrate ${migrateSubcommand} — the resolved database URL (DIRECT_URL or DATABASE_URL) is not a parseable URL.`,
    )
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
