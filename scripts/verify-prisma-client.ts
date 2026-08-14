import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Runs immediately after `prisma generate` in the db-update chain.
//
// A concurrent generate — most often `db-update` started while a dev server triggers its own — can
// write the client truncated while still reporting success. Nothing downstream notices: the output
// directory is gitignored, and Nx hashes task inputs rather than outputs, so an unchanged schema
// produces an unchanged cache key regardless of what was actually written.
//
// Left alone, the first symptom appears much later and points nowhere near the cause. `client.ts`
// re-exports `enums.ts`, so every enum resolves to undefined at runtime, `registerEnumType` stores
// an undefined ref, and the API dies building the GraphQL schema with "Cannot convert undefined or
// null to object" — a message naming neither Prisma nor this file. Failing here keeps the error
// next to the thing that caused it.

const schemaDir = 'libs/api/prisma/src/lib/schemas'
const enumsPath = 'libs/api/prisma/src/lib/prisma-generated/enums.ts'

// Prisma supports a split schema directory (datasource/generator in one file, models and enums in
// others). Read enums from EVERY .prisma file in the dir, not just schema.prisma — a split-schema repo
// (mi-core has ~29 files) would otherwise find zero enums in schema.prisma and pass without verifying
// anything (fleet-upstream #125).
const getDeclaredEnums = (): string[] => {
  if (!existsSync(schemaDir)) return []
  const enums: string[] = []
  for (const entry of readdirSync(schemaDir)) {
    if (!entry.endsWith('.prisma')) continue
    for (const match of readFileSync(join(schemaDir, entry), 'utf8').matchAll(/^enum\s+(\w+)/gm)) {
      enums.push(match[1])
    }
  }
  return enums
}

const fail = (message: string): never => {
  console.error(`\nPrisma client verification failed.\n\n${message}\n`)
  console.error('Re-run: pnpm prisma:generate')
  console.error(
    'Then rebuild with: pnpm nx build api --skip-nx-cache  (Nx will otherwise reuse the stale bundle)\n',
  )
  process.exit(1)
}

const declaredEnums = getDeclaredEnums()
if (declaredEnums.length === 0) process.exit(0)

if (!existsSync(enumsPath)) {
  fail(
    `The Prisma schema declares ${declaredEnums.length} enum(s) but ${enumsPath} was not written.`,
  )
}

const source = readFileSync(enumsPath, 'utf8')
const missing = declaredEnums.filter(name => !source.includes(`export const ${name} =`))

if (missing.length > 0) {
  fail(
    `${enumsPath} is missing ${missing.length} of ${declaredEnums.length} enum(s): ${missing.join(', ')}.\n` +
      'These would be undefined at runtime and the API would fail while building the GraphQL schema.',
  )
}

console.log(`Prisma client verified: ${declaredEnums.length} enum(s) generated.`)
