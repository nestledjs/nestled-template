#!/usr/bin/env node
/**
 * Verify explicit Prisma select constants COVER the GraphQL type they answer for.
 *
 * This is the reverse of tools/verify-selects.mjs. That tool asks "is every field in
 * the select a real Prisma field?" — it catches selects that Prisma rejects. This one
 * asks the question that broke `me`: "is every field the GraphQL type exposes present
 * in the select?"
 *
 * It matters because a resolver returns a whole generated model type. `me: User` lets a
 * client request any field on `User`, no matter which fields the SDK documents the select
 * was derived from happen to use. When the select omits one:
 *
 *   nullable field      -> silently returns null. Nothing errors. Worst case.
 *   non-nullable field  -> the whole query fails with
 *                          "Cannot return null for non-nullable field User.pdMember."
 *
 * Deriving a select from "the fields our documents ask for" is therefore not sufficient.
 * Typecheck cannot see this: the select is a plain object and the mismatch only exists
 * against the SDL.
 *
 * What it gates on, and why the three classes differ:
 *
 *   top-level, non-nullable  GATED. A guaranteed hard failure whenever the field is
 *                            requested.
 *   nested, non-nullable     Reported as a count; --strict-nested to list and gate.
 *                            Widening a nested select can expose fields from another
 *                            user's row. The real fix is often a purpose-built output.
 *   nullable, any depth      --warn-nullable only. Silent nulls, but narrowing is
 *                            frequently deliberate.
 *
 * A deliberate omission is declared, not hidden. Annotate the constant:
 *
 *   /** @select-omits redFlagged, tokenVersion *\/
 *   const USER_SELF_SCALARS = { ... }
 *
 * Declared omissions still error at runtime if requested — that is the intent. Keeping a
 * credential or moderation column out of a self-read is worth an error; a silent leak is
 * not. The annotation records the decision so review sees a choice rather than a gap.
 *
 * Omissions and fields are both inherited through `...SPREAD` of another constant in the
 * same file, so a shared base declares once for every select that spreads it.
 *
 * Usage:
 *   node tools/verify-select-coverage.mjs [--json] [--warn-nullable] [--strict-nested] [root ...]
 *
 * Requires api-schema.graphql, which the API emits at boot. Run it after a boot;
 * a stale schema reports stale results.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SCHEMA_DIRECTORY_CANDIDATES = [
  'libs/api/prisma/src/lib/schemas',
  'prisma',
  'libs/api/prisma/src/lib',
]
const DEFAULT_SEARCH_ROOTS = ['libs/api/custom/src', 'libs/api/core', 'apps/api/src']
const SDL_PATH = 'api-schema.graphql'

const PRISMA_SCALARS = new Set([
  'String',
  'Int',
  'Float',
  'Boolean',
  'DateTime',
  'Json',
  'Decimal',
  'BigInt',
  'Bytes',
])

const cwd = process.cwd()
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const warnNullable = argv.includes('--warn-nullable')
const strictNested = argv.includes('--strict-nested')
const roots = argv.filter(argument => !argument.startsWith('--'))
const searchRoots = roots.length > 0 ? roots : DEFAULT_SEARCH_ROOTS

// ── GraphQL SDL ──────────────────────────────────────────────────────────────
const sdlPath = resolve(cwd, SDL_PATH)
if (!existsSync(sdlPath)) {
  console.error(`verify-select-coverage: ${SDL_PATH} not found. Boot the API once to emit it.`)
  process.exit(2)
}
const sdl = readFileSync(sdlPath, 'utf8')

const graphqlTypes = {}
for (const match of sdl.matchAll(/^type (\w+) \{\n([\s\S]*?)^\}/gm)) {
  const [, name, body] = match
  const fields = {}
  for (const line of body.split('\n')) {
    const field = line.match(/^ {2}(\w+)(\([^)]*\))?: (.+)$/)
    if (field) fields[field[1]] = { nonNull: field[3].trim().endsWith('!') }
  }
  graphqlTypes[name] = fields
}

// ── Prisma datamodel ─────────────────────────────────────────────────────────
const schemaDirectory = SCHEMA_DIRECTORY_CANDIDATES.map(candidate => resolve(cwd, candidate)).find(
  candidate =>
    existsSync(candidate) && readdirSync(candidate).some(file => file.endsWith('.prisma')),
)
if (!schemaDirectory) {
  console.error(
    `verify-select-coverage: no .prisma schema under ${SCHEMA_DIRECTORY_CANDIDATES.join(', ')}`,
  )
  process.exit(2)
}
const datamodel = readdirSync(schemaDirectory)
  .filter(file => file.endsWith('.prisma'))
  .sort()
  .map(file => readFileSync(join(schemaDirectory, file), 'utf8'))
  .join('\n')

const enumNames = new Set([...datamodel.matchAll(/^enum (\w+) \{/gm)].map(match => match[1]))
const modelNames = new Set([...datamodel.matchAll(/^model (\w+) \{/gm)].map(match => match[1]))

/** model -> set of selectable scalar columns (relations excluded: they need their own select) */
const prismaScalars = {}
/** model -> { relationField: targetModel } */
const prismaRelations = {}
for (const match of datamodel.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
  const [, name, body] = match
  const columns = new Set()
  const relations = {}
  for (const line of body.split('\n')) {
    const field = line.match(/^\s+(\w+)\s+(\w+)(\[\])?/)
    if (!field) continue
    const [, column, type, list] = field
    if (PRISMA_SCALARS.has(type) || (enumNames.has(type) && !list)) columns.add(column)
    else if (modelNames.has(type)) relations[column] = type
  }
  prismaScalars[name] = columns
  prismaRelations[name] = relations
}

// ── select constants ─────────────────────────────────────────────────────────
const selectFiles = []
const walk = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name.endsWith('.select.ts')) selectFiles.push(path)
  }
}
for (const root of searchRoots) {
  const absolute = resolve(cwd, root)
  if (existsSync(absolute)) walk(absolute)
}

/**
 * Body of a named select constant, however it happens to be declared.
 *
 * The previous pattern required the exact shape `const NAME = {` … `\n} as const`, which silently
 * returned nothing for two forms that occur in real projects: a type annotation
 * (`const NAME: Prisma.XSelect = {`) and a constant with no `as const` suffix. When a `...SPREAD`
 * cannot be resolved the fields it contributes are simply absent, so the caller reports them as
 * missing — a false positive, in a checker that gates CI. A checker that fails builds for fields
 * that are in fact selected gets switched off, which costs more than the check was worth.
 *
 * Brace matching replaces the non-greedy scan so the terminator no longer has to be guessed, and
 * the value must actually begin with `{`: without that guard a non-object constant would send
 * `objectBodyAt` hunting forward for an unrelated brace elsewhere in the file.
 */
/**
 * The declaration head of a named constant, tolerant of the shapes these projects actually use:
 * an `export` prefix, `let`/`var`, and a type annotation.
 *
 * Both readers below share this deliberately. They previously carried separate patterns and drifted
 * apart, so widening one to accept `const NAME: Prisma.XSelect = {` left the other still blind to
 * it — and that reader is the one that finds `@select-omits` and `@prisma-model`. A base whose
 * omissions were declared but not seen reports those fields as missing, which is the same false
 * positive this file was fixing, one layer up.
 *
 * The match starts at `export` when present rather than at `const`. `annotationFor` slices the text
 * before the match to find the JSDoc immediately above it, and a stray `export ` left between the
 * comment and the declaration would read as intervening code and discard the annotation.
 */
const declarationOf = (source, name) =>
  new RegExp(`\\b(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*`).exec(source)

/**
 * Names of exported constants whose value is an object literal — the candidate selects in a file.
 *
 * Only exported names are candidates, matching the previous behaviour: a module-private constant is
 * a building block reached through a spread, not a select the API returns, and checking it directly
 * would report the base's deliberate partiality as a defect.
 */
const exportedConstantNames = source => [
  ...new Set(
    [...source.matchAll(/\bexport\s+(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*\{/g)].map(
      match => match[1],
    ),
  ),
]

const constantBody = (source, name) => {
  const declaration = declarationOf(source, name)
  if (!declaration) return null
  const cursor = declaration.index + declaration[0].length
  if (source[cursor] !== '{') return null
  return objectBodyAt(source, cursor)
}

const annotationFor = (source, name, tag) => {
  const declaration = declarationOf(source, name)
  if (!declaration) return []
  const preceding = source.slice(0, declaration.index)
  const commentEnd = preceding.lastIndexOf('*/')
  if (commentEnd === -1 || preceding.slice(commentEnd + 2).trim() !== '') return []
  const commentStart = preceding.lastIndexOf('/**', commentEnd)
  if (commentStart === -1) return []
  const jsdoc = preceding.slice(commentStart + 3, commentEnd)
  const found = [...jsdoc.matchAll(new RegExp(`@${tag}\\s+([^\\n*]+)`, 'g'))].pop()
  return found
    ? found[1]
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    : []
}

const pascalCase = value =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join('')

const constantModelCandidates = name => {
  const words = name
    .replace(/_?SELECT.*$/, '')
    .split('_')
    .filter(Boolean)
  const candidates = []
  for (let length = words.length; length > 0; length--) {
    for (let start = 0; start + length <= words.length; start++) {
      candidates.push(pascalCase(words.slice(start, start + length).join('_')))
    }
  }
  return candidates
}

/** Body of the object literal that starts at the `{` on or after `from`. */
const objectBodyAt = (text, from) => {
  const open = text.indexOf('{', from)
  if (open < 0) return null
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === '{') depth++
    else if (text[index] === '}') {
      depth--
      if (depth === 0) return text.slice(open + 1, index)
    }
  }
  return null
}

/**
 * Top-level entries of a select body, following `...OTHER` spreads within the file. `nested`
 * maps a relation key to the body of its inner `select: { ... }`, so the caller can recurse into
 * it against the relation's target model.
 */
const resolveSelect = (source, body, seen = new Set()) => {
  const keys = new Set()
  const omits = new Set()
  const nested = {}
  let depth = 0
  const lines = body.split('\n')
  let offset = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (depth === 0) {
      const inlineOmit = trimmed.match(/@select-omits\s+([^\n*]+)/)
      if (inlineOmit) {
        for (const field of inlineOmit[1]
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)) {
          omits.add(field)
        }
      }
      const key = trimmed.match(/^(\w+):/)
      if (key) {
        keys.add(key[1])
        const rest = body.slice(offset + line.indexOf(':') + 1)
        if (rest.trimStart().startsWith('{')) {
          const outer = objectBodyAt(rest, 0)
          if (outer) {
            const selectAt = outer.search(/\bselect:/)
            if (selectAt >= 0) nested[key[1]] = objectBodyAt(outer, selectAt)
          }
        }
      }
      const spread = trimmed.match(/^\.\.\.([A-Z][A-Z0-9_]*)\b/)
      if (spread && !seen.has(spread[1])) {
        seen.add(spread[1])
        const inner = constantBody(source, spread[1])
        if (inner) {
          const resolved = resolveSelect(source, inner, seen)
          for (const field of resolved.keys) keys.add(field)
          for (const omitted of resolved.omits) omits.add(omitted)
          for (const [field, select] of Object.entries(resolved.nested)) {
            nested[field] ??= select
          }
          for (const omitted of annotationFor(source, spread[1], 'select-omits')) {
            omits.add(omitted)
          }
        }
      }
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
    offset += line.length + 1
  }
  return { keys, omits, nested }
}

const modelFor = (source, name, file) => {
  const annotated = annotationFor(source, name, 'prisma-model')[0]
  if (annotated) return annotated
  for (const candidate of constantModelCandidates(name)) {
    if (prismaScalars[candidate]) return candidate
  }
  const base = file.split('/').pop().replace('.select.ts', '')
  const pascal = pascalCase(base)
  return prismaScalars[pascal] ? pascal : null
}

const problems = []
const nestedProblems = []
const unresolved = []
const nullableGaps = []

for (const file of selectFiles.sort()) {
  const source = readFileSync(file, 'utf8')
  const relativePath = relative(cwd, file)
  // Discovery deliberately shares the declaration shapes the readers below accept. It previously
  // required `export const NAME = {` … `\n} as const` exactly, which meant a type-annotated select
  // was never discovered at all: not checked, not reported unresolved, simply invisible. That is a
  // worse failure than the false positive this file set out to fix, because it reports success by
  // omission — the check passes precisely because it looked at nothing.
  for (const name of exportedConstantNames(source)) {
    const body = constantBody(source, name)
    if (body === null) continue
    const model = modelFor(source, name, file)
    if (!model || !prismaScalars[model]) {
      unresolved.push({ file: relativePath, constant: name, reason: 'model not resolved' })
      continue
    }
    const graphqlType = graphqlTypes[model]
    if (!graphqlType) {
      unresolved.push({
        file: relativePath,
        constant: name,
        reason: `no GraphQL type ${model}`,
      })
      continue
    }

    const walkSelect = (currentModel, selectBody, path, depth = 0) => {
      if (depth > 6) return
      const graphql = graphqlTypes[currentModel]
      if (!graphql || !prismaScalars[currentModel]) return

      const { keys, omits, nested } = resolveSelect(source, selectBody)
      if (depth === 0) {
        for (const omitted of annotationFor(source, name, 'select-omits')) omits.add(omitted)
      }

      const hard = []
      const soft = []
      for (const [field, information] of Object.entries(graphql)) {
        if (!prismaScalars[currentModel].has(field)) continue
        if (keys.has(field) || omits.has(field)) continue
        ;(information.nonNull ? hard : soft).push(field)
      }
      if (hard.length > 0) {
        const bucket = depth === 0 ? problems : nestedProblems
        bucket.push({
          file: relativePath,
          constant: path,
          model: currentModel,
          missing: hard.sort(),
        })
      }
      if (soft.length > 0) {
        nullableGaps.push({
          file: relativePath,
          constant: path,
          model: currentModel,
          missing: soft.sort(),
        })
      }

      for (const [key, innerBody] of Object.entries(nested)) {
        const target = prismaRelations[currentModel]?.[key]
        if (target && innerBody) walkSelect(target, innerBody, `${path}.${key}`, depth + 1)
      }
    }

    walkSelect(model, body, name)
  }
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        files: selectFiles.length,
        problems,
        nestedProblems,
        unresolved,
        nullableGaps: warnNullable ? nullableGaps : undefined,
      },
      null,
      2,
    ),
  )
} else {
  console.log(`\nverify-select-coverage — ${selectFiles.length} file(s), SDL ${SDL_PATH}\n`)
  for (const entry of unresolved) {
    console.log(`?  ${entry.file} — ${entry.constant}: ${entry.reason}`)
  }
  for (const entry of problems) {
    console.log(`✗  ${entry.file} — ${entry.constant} [${entry.model}]`)
    console.log(`     omits ${entry.missing.length} non-nullable field(s); requesting any of`)
    console.log('     them fails the whole query, it does not return null:')
    console.log(`       ${entry.missing.join(', ')}`)
    console.log('     add them, or declare intent with /** @select-omits ... */\n')
  }
  if (nestedProblems.length > 0) {
    const fieldCount = nestedProblems.reduce((sum, entry) => sum + entry.missing.length, 0)
    if (strictNested) {
      for (const entry of nestedProblems) {
        console.log(`✗  ${entry.file} — ${entry.constant} [${entry.model}]`)
        console.log(`     ${entry.missing.length} non-nullable: ${entry.missing.join(', ')}\n`)
      }
    } else {
      console.log(
        `!  ${nestedProblems.length} nested select(s) omit ${fieldCount} non-nullable field(s).`,
      )
      console.log("   Latent, not gated: widening a nested select can expose another user's row.")
      console.log('   The real fix is usually a purpose-built output type.')
      console.log('   Run with --strict-nested to list them.\n')
    }
  }
  if (warnNullable) {
    for (const entry of nullableGaps) {
      console.log(`!  ${entry.file} — ${entry.constant} [${entry.model}]`)
      console.log(`     ${entry.missing.length} nullable field(s) return null if requested:`)
      console.log(`       ${entry.missing.join(', ')}\n`)
    }
  }
  if (selectFiles.length === 0) {
    console.log('no reusable *.select.ts files discovered; nothing was checked\n')
  } else if (problems.length === 0 && unresolved.length === 0) {
    console.log('every top-level select covers the non-nullable surface of its GraphQL type\n')
  }
}

const failed =
  problems.length > 0 || unresolved.length > 0 || (strictNested && nestedProblems.length > 0)
process.exit(failed ? 1 : 0)
