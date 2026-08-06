import { existsSync, readFileSync } from 'node:fs'

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

const schemaPath = 'libs/api/prisma/src/lib/schemas/schema.prisma'
const enumsPath = 'libs/api/prisma/src/lib/prisma-generated/enums.ts'

const getDeclaredEnums = (): string[] => {
  if (!existsSync(schemaPath)) return []
  const matches = readFileSync(schemaPath, 'utf8').matchAll(/^enum\s+(\w+)/gm)
  return [...matches].map(match => match[1])
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
  fail(`${schemaPath} declares ${declaredEnums.length} enum(s) but ${enumsPath} was not written.`)
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
