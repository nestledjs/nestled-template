#!/usr/bin/env tsx
/**
 * Every field an SDK fragment requests must be produced by the resolver's Prisma select.
 *
 * `tools/verify-selects.mjs` checks the OTHER direction: that a select names only columns the
 * Prisma schema actually has. A select can pass that check completely and still be wrong, because
 * a select is also allowed to be too NARROW. When a fragment asks for a column the select omits,
 * Prisma simply does not load it, GraphQL resolves it to `null`, and the client renders a blank
 * field. Nothing throws. Nothing logs. The only symptom is missing data on a screen, which is
 * exactly the failure the boundary migration was most likely to introduce: 41 resolvers were
 * rewritten from generic `info`-driven selection to hand-written explicit selects, and an explicit
 * select is only as complete as the person who typed it.
 *
 * The required side reuses `buildPrismaSelectFromFragments`, so it sees precisely what
 * `tools/fragment-to-select.ts` would generate: comments ignored, fragment spreads followed across
 * the whole SDK, and GraphQL-only fields (`@ResolveField` values with no column behind them)
 * filtered out through generated DATABASE_MODELS metadata.
 *
 * Granularity, stated honestly: this compares the UNION of fragments on a model against the
 * selects for that model. It is not per-operation. That yields two levels:
 *
 *   MISSING  a fragment field no select for the model produces. Some operation returns null for
 *            it. This is a real defect.
 *   PARTIAL  a field some selects have and others lack. Usually correct and intentional — a list
 *            select is meant to be thinner than a detail select — so it is advisory, not a
 *            failure. Read it when a specific screen looks empty.
 *
 * Only MISSING sets a non-zero exit code.
 *
 * Known blind spots, so nobody reads a clean run as more than it is:
 *   - inline selects written at a call site rather than as a named constant are not attributed
 *   - `...SPREAD` is resolved only within the same file
 *   - models served entirely by generated CRUD have no select constant and are skipped (they are
 *     covered by generated-crud-guards.spec.ts instead)
 * Each of these is counted and printed, so the report says what it did not check.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildPrismaSelectFromFragments,
  type DatabaseModelMetadata,
  type GraphqlSource,
  type PrismaSelect,
} from '../scripts/doctor-sdk-contract-analysis'

const usage = `Usage:
  pnpm exec tsx tools/verify-fragment-coverage.ts [repo] [--verbose]

Reports SDK fragment fields that no resolver select produces. Exits non-zero on MISSING.`

const SEARCH_ROOTS = ['libs/api/custom/src', 'libs/api/core', 'apps/api/src']
const SELECT_FILE_SUFFIXES = ['.select.ts', '.resolver.ts', '.service.ts']
const SELECT_CONSTANT = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{/g

const alphabetical = (left: string, right: string): number => left.localeCompare(right)

const walk = (directory: string, keep: (path: string) => boolean): string[] => {
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) files.push(...walk(path, keep))
    else if (stat.isFile() && keep(path)) files.push(path)
  }
  return files.sort(alphabetical)
}

/**
 * Blank out comments and string bodies while preserving every byte offset.
 *
 * Offsets must survive because the `@prisma-model` annotation is located by scanning backwards
 * from a constant's offset in the raw source. Deleting rather than blanking would shift every
 * offset after the first comment and silently misattribute annotations.
 */
export const sanitize = (source: string): string => {
  const out = source.split('')
  let index = 0
  while (index < source.length) {
    const two = source.slice(index, index + 2)
    if (two === '//') {
      while (index < source.length && source[index] !== '\n') out[index++] = ' '
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      while (index < stop) {
        if (source[index] !== '\n') out[index] = ' '
        index++
      }
      continue
    }
    const quote = source[index]
    if (quote === '"' || quote === "'" || quote === '`') {
      out[index] = ' '
      index++
      while (index < source.length) {
        if (source[index] === '\\') {
          out[index] = ' '
          // A line-continuation escapes the newline itself. Blanking it unconditionally would
          // delete a real line break and shift every line number reported after this string.
          if (source[index + 1] !== '\n') out[index + 1] = ' '
          index += 2
          continue
        }
        const done = source[index] === quote
        if (source[index] !== '\n') out[index] = ' '
        index++
        if (done) break
      }
      continue
    }
    index++
  }
  return out.join('')
}

export const matchingBrace = (source: string, open: number): number => {
  let depth = 0
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++
    else if (source[index] === '}') {
      depth--
      if (depth === 0) return index
    }
  }
  return -1
}

interface RawEntry {
  kind: 'object' | 'true' | 'other'
  name: string
  open: number
}

interface ScannedObject {
  entries: RawEntry[]
  spreads: string[]
}

/** One level of an object literal: its keys, their value kinds, and any `...SPREAD`. No recursion. */
export const scanObject = (source: string, open: number): ScannedObject => {
  const entries: RawEntry[] = []
  const spreads: string[] = []
  const close = matchingBrace(source, open)
  if (close === -1) return { entries, spreads }

  let index = open + 1
  while (index < close) {
    const character = source[index]
    if (character === undefined || /\s|,/.test(character)) {
      index++
      continue
    }
    if (source.startsWith('...', index)) {
      const spread = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(source.slice(index, close))
      if (spread) spreads.push(spread[1])
      index += spread ? spread[0].length : 3
      continue
    }
    const key = /^([A-Za-z_$][\w$]*)\s*:/.exec(source.slice(index, close + 1))
    if (!key) {
      index++
      continue
    }
    let cursor = index + key[0].length
    while (cursor < close && /\s/.test(source[cursor])) cursor++

    if (source.startsWith('true', cursor)) {
      entries.push({ kind: 'true', name: key[1], open: cursor })
      index = cursor + 4
      continue
    }
    if (source[cursor] === '{') {
      entries.push({ kind: 'object', name: key[1], open: cursor })
      const nestedClose = matchingBrace(source, cursor)
      index = nestedClose === -1 ? cursor + 1 : nestedClose + 1
      continue
    }
    // `false`, a variable, a call — not a column selection we can attribute.
    entries.push({ kind: 'other', name: key[1], open: cursor })
    index = cursor + 1
  }

  return { entries, spreads }
}

/**
 * Interpret a select object literal as nested `{field: true | {select}}`.
 *
 * A relation is written `relation: { select: {...} }`, often alongside `take`, `orderBy` or
 * `where`. Only the `select` sub-object names columns; the rest are query arguments. The
 * distinction has to be made HERE, one level above, rather than by looking for a `select` key
 * inside the columns themselves — the innermost `{ id: true }` has no `select` of its own, and
 * treating that as "not a relation" silently drops every relation in the file.
 */
export const toSelect = (source: string, open: number): PrismaSelect => {
  const select: PrismaSelect = {}
  for (const entry of scanObject(source, open).entries) {
    if (entry.kind === 'true') {
      select[entry.name] = true
      continue
    }
    if (entry.kind !== 'object') continue
    const inner = scanObject(source, entry.open).entries.find(
      candidate => candidate.name === 'select' && candidate.kind === 'object',
    )
    select[entry.name] = { select: inner ? toSelect(source, inner.open) : {} }
  }
  return select
}

export const mergeInto = (target: PrismaSelect, source: PrismaSelect): void => {
  for (const [field, value] of Object.entries(source)) {
    const existing = target[field]
    if (value === true) {
      if (!existing) target[field] = true
      continue
    }
    if (existing && existing !== true) mergeInto(existing.select, value.select)
    else target[field] = { select: { ...value.select } }
  }
}

interface SelectConstant {
  file: string
  model: string | undefined
  name: string
  select: PrismaSelect
}

/**
 * A constant's fields plus everything reachable through its `...SPREAD` chain.
 *
 * `seen` guards against a cycle: a constant that spreads itself, directly or through a chain, would
 * otherwise recurse forever. A cycle is not valid TypeScript, but this tool parses text rather than
 * evaluating it, so it must not hang on input a compiler would have rejected.
 */
export const resolveSpreads = (
  name: string,
  inFile: ReadonlyMap<string, { select: PrismaSelect; spreads: string[] }>,
  seen: Set<string> = new Set(),
): PrismaSelect => {
  const resolved: PrismaSelect = {}
  if (seen.has(name)) return resolved
  seen.add(name)

  const entry = inFile.get(name)
  if (!entry) return resolved

  for (const spread of entry.spreads) mergeInto(resolved, resolveSpreads(spread, inFile, seen))
  mergeInto(resolved, entry.select)
  return resolved
}

const modelForConstant = (
  name: string,
  annotated: string | undefined,
  models: readonly DatabaseModelMetadata[],
): string | undefined => {
  if (annotated) return models.find(model => model.modelName === annotated)?.modelName
  const stem = name.replace(/_(FIELDS|SELECT)$/, '').replaceAll('_', '')
  return models.find(model => model.modelName.toUpperCase() === stem)?.modelName
}

/** The `@prisma-model X` annotation attached to a constant, if the comment directly precedes it. */
const annotationBefore = (raw: string, offset: number, previousEnd: number): string | undefined => {
  const window = raw.slice(Math.max(previousEnd, 0), offset)
  const matches = [...window.matchAll(/@prisma-model\s+([A-Za-z_$][\w$]*)/g)]
  return matches.length > 0 ? matches[matches.length - 1][1] : undefined
}

const readSelectConstants = (
  repo: string,
  models: readonly DatabaseModelMetadata[],
): SelectConstant[] => {
  const constants: SelectConstant[] = []

  for (const root of SEARCH_ROOTS) {
    const files = walk(join(repo, root), path => SELECT_FILE_SUFFIXES.some(s => path.endsWith(s)))
    for (const absolute of files) {
      if (absolute.includes('.spec.')) continue
      const raw = readFileSync(absolute, 'utf8')
      const source = sanitize(raw)
      const file = relative(repo, absolute)

      const inFile = new Map<string, { select: PrismaSelect; spreads: string[] }>()
      let previousEnd = 0
      SELECT_CONSTANT.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = SELECT_CONSTANT.exec(source)) !== null) {
        const open = source.indexOf('{', match.index + match[0].length - 1)
        if (open === -1) continue
        const select = toSelect(source, open)
        const { spreads } = scanObject(source, open)
        if (Object.keys(select).length === 0 && spreads.length === 0) continue
        const annotated = annotationBefore(raw, match.index, previousEnd)
        previousEnd = matchingBrace(source, open)
        inFile.set(match[1], { select, spreads })
        constants.push({
          file,
          model: modelForConstant(match[1], annotated, models),
          name: match[1],
          select,
        })
      }

      // Resolve `...SPREAD` against constants declared in the same file, following chains.
      //
      // A single pass would be order-dependent: if A spreads B and B spreads C, then resolving A
      // before B has resolved its own spreads gives A only B's literal fields, and every field
      // reaching A through C would be reported MISSING even though it is selected. Recursing per
      // constant makes the result independent of declaration order.
      for (const constant of constants.filter(entry => entry.file === file)) {
        constant.select = resolveSpreads(constant.name, inFile)
      }
    }
  }

  return constants
}

/**
 * GraphQL fields each model serves with `@ResolveField` rather than from the parent's select.
 *
 * These are the reason a narrow select is often correct. `Album.totalMinutes` and `Album.trackCount`
 * are real columns, but the resolver computes them in `@ResolveField` and deliberately leaves them
 * out of ALBUM_FIELDS; the same is true of most relations. Counting those as missing would bury the
 * handful of genuine omissions under hundreds of false positives — which is exactly what the first
 * run of this tool did.
 */
export const resolveFieldsByModel = (repo: string): Map<string, Set<string>> => {
  const served = new Map<string, Set<string>>()

  for (const root of SEARCH_ROOTS) {
    for (const absolute of walk(join(repo, root), path => path.endsWith('.resolver.ts'))) {
      if (absolute.includes('.spec.')) continue
      const source = sanitize(readFileSync(absolute, 'utf8'))

      // Split on the class decorator so each @ResolveField is attributed to the right model.
      const classes = [...source.matchAll(/@Resolver\(\s*\(\)\s*=>\s*(\w+)/g)]
      for (let index = 0; index < classes.length; index++) {
        const modelName = classes[index][1]
        const start = classes[index].index ?? 0
        const end = index + 1 < classes.length ? (classes[index + 1].index ?? source.length) : source.length
        const body = source.slice(start, end)

        const fields = served.get(modelName) ?? new Set<string>()
        for (const match of body.matchAll(
          /@ResolveField\(([\s\S]*?)\)\s*\n\s*(?:async\s+)?(\w+)\s*\(/g,
        )) {
          // `@ResolveField(() => X, { name: 'graphqlName' })` overrides the method name.
          const renamed = /name:\s*['"`]?(\w+)/.exec(match[1])
          fields.add(renamed ? renamed[1] : match[2])
        }
        served.set(modelName, fields)
      }
    }
  }

  return served
}

export const relationTarget = (
  models: readonly DatabaseModelMetadata[],
  modelName: string,
  fieldName: string,
): string | undefined => {
  const field = models.find(model => model.modelName === modelName)?.fields
    ?.find(entry => entry.name === fieldName)
  return field && field.kind === 'object' ? field.type : undefined
}

/**
 * Fragment-required paths, minus anything a `@ResolveField` supplies at that level.
 *
 * Skipping a served field skips its whole subtree: once `Album.tracks` is resolved separately, the
 * parent select owes nothing about a track.
 */
export const requiredPaths = (
  select: PrismaSelect,
  modelName: string,
  served: ReadonlyMap<string, Set<string>>,
  models: readonly DatabaseModelMetadata[],
  prefix = '',
): { skipped: string[]; wanted: string[] } => {
  const wanted: string[] = []
  const skipped: string[] = []

  for (const [field, value] of Object.entries(select)) {
    const path = prefix ? `${prefix}.${field}` : field
    if (served.get(modelName)?.has(field)) {
      skipped.push(path)
      continue
    }
    wanted.push(path)
    if (value === true) continue
    const child = relationTarget(models, modelName, field)
    if (!child) continue
    const nested = requiredPaths(value.select, child, served, models, path)
    wanted.push(...nested.wanted)
    skipped.push(...nested.skipped)
  }

  return { skipped, wanted }
}

export const flatten = (select: PrismaSelect, prefix = ''): string[] => {
  const paths: string[] = []
  for (const [field, value] of Object.entries(select)) {
    const path = prefix ? `${prefix}.${field}` : field
    if (value === true) paths.push(path)
    else {
      paths.push(path)
      paths.push(...flatten(value.select, path))
    }
  }
  return paths
}

const graphqlSources = (root: string): GraphqlSource[] =>
  walk(root, path => path.endsWith('.graphql')).map(file => ({
    file,
    source: readFileSync(file, 'utf8'),
  }))

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage)
    return
  }
  const verbose = args.includes('--verbose')
  const repo = resolve(args.find(argument => !argument.startsWith('--')) ?? process.cwd())

  const metadataPath = join(repo, 'libs/shared/sdk/src/lib/database-models.ts')
  const { DATABASE_MODELS } = (await import(pathToFileURL(metadataPath).href)) as {
    DATABASE_MODELS: DatabaseModelMetadata[]
  }
  const allSources = graphqlSources(join(repo, 'libs/shared/sdk/src/graphql'))
  if (allSources.length === 0) throw new Error('No SDK .graphql files found')

  const constants = readSelectConstants(repo, DATABASE_MODELS)
  const byModel = new Map<string, SelectConstant[]>()
  for (const constant of constants) {
    if (!constant.model) continue
    const list = byModel.get(constant.model) ?? []
    list.push(constant)
    byModel.set(constant.model, list)
  }

  const fragmentModels = new Set(
    allSources.flatMap(source =>
      [...source.source.matchAll(/^fragment\s+\w+\s+on\s+(\w+)/gm)].map(match => match[1]),
    ),
  )

  const served = resolveFieldsByModel(repo)
  const missing: string[] = []
  const partial: string[] = []
  const skipped: string[] = []
  let checkedModels = 0
  let resolvedElsewhere = 0

  for (const modelName of [...fragmentModels].sort(alphabetical)) {
    if (!DATABASE_MODELS.some(model => model.modelName === modelName)) continue
    const selects = byModel.get(modelName)
    if (!selects || selects.length === 0) {
      skipped.push(modelName)
      continue
    }

    let required: PrismaSelect
    try {
      required = buildPrismaSelectFromFragments({
        allSources,
        models: DATABASE_MODELS,
        rootSources: allSources,
        targetModelName: modelName,
      }).select
    } catch {
      skipped.push(modelName)
      continue
    }

    checkedModels++
    const { skipped: viaResolveField, wanted } = requiredPaths(
      required,
      modelName,
      served,
      DATABASE_MODELS,
    )
    resolvedElsewhere += viaResolveField.length
    const provided = selects.map(select => new Set(flatten(select.select)))

    for (const path of wanted) {
      const holders = provided.filter(set => set.has(path)).length
      if (holders === 0) {
        missing.push(`${modelName}.${path} — produced by none of ${selects.map(s => s.name).join(', ')}`)
      } else if (holders < selects.length) {
        const without = selects.filter((_, index) => !provided[index].has(path)).map(s => s.name)
        partial.push(`${modelName}.${path} — absent from ${without.join(', ')}`)
      }
    }
  }

  console.log(
    `Checked ${checkedModels} model(s) with both fragments and selects; ` +
      `${constants.length} select constant(s) parsed; ` +
      `${resolvedElsewhere} field(s) skipped as @ResolveField.`,
  )

  if (missing.length > 0) {
    console.log(`\nMISSING (${missing.length}) — a fragment asks for these and nothing produces them:`)
    for (const entry of missing.sort(alphabetical)) console.log(`  ${entry}`)
  }

  if (verbose && partial.length > 0) {
    console.log(`\nPARTIAL (${partial.length}) — advisory; thinner list selects are usually correct:`)
    for (const entry of partial.sort(alphabetical)) console.log(`  ${entry}`)
  } else if (partial.length > 0) {
    console.log(`\nPARTIAL: ${partial.length} field(s) present in some selects but not others (--verbose to list).`)
  }

  if (skipped.length > 0) {
    console.log(
      `\nNOT CHECKED (${skipped.length}): no named select constant maps to these models — ` +
        `generated CRUD or inline selects. ${verbose ? skipped.sort(alphabetical).join(', ') : '--verbose to list'}`,
    )
  }

  if (missing.length === 0) console.log('\nNo fragment field is unproduced by its model’s selects.')
  process.exitCode = missing.length > 0 ? 1 : 0
}

// Only run when invoked as a script, so the parser can be unit-tested by importing this module.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
