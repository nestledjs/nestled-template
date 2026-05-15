import 'dotenv/config'
import * as path from 'node:path'
import { defineConfig } from 'prisma/config'

// Use process.env with fallback for CI where DATABASE_URL may not be set during prisma generate
// The fallback URL is only used for schema parsing, not actual database connections
const databaseUrl = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder'

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
