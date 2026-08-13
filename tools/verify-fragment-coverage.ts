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
 * Granularity: by default this compares the UNION of fragments on a model against the selects
 * for that model. It is not per-operation. That yields two levels:
 *
 *   MISSING  a fragment field no select for the model produces. Some operation returns null for
 *            it. This is a real defect.
 *   PARTIAL  a field some selects have and others lack. Usually correct and intentional — a list
 *            select is meant to be thinner than a detail select — so it is advisory, not a
 *            failure. Read it when a specific screen looks empty. EXCEPT when the field is
 *            non-nullable in api-schema.graphql: then the thinner select does not return null
 *            for it, it fails the whole query ("Cannot return null for non-nullable field") the
 *            moment any document served by that select requests it. That was the login-breaking
 *            redFlagged incident, and it was sitting in this advisory bucket — so a non-nullable
 *            PARTIAL is a FAILURE unless every select lacking the field acknowledges it with
 *            `@select-omits <field>` (the deliberate deny-list case, e.g. a self-read).
 *
 * A select annotated with `@graphql-operations <paths>` opts out of the model union into a
 * sharper PER-OPERATION check: the required set is what SDK documents actually request at those
 * positions (`me`, or `UserToken.user` for a field resolver shared across operations), and ANY
 * requested field the select lacks is a failure — nullable ones are silent blanks, non-nullable
 * ones kill the query. A required field that is also in `@select-omits` is the sharpest failure
 * of all: a served document is requesting a field the select deliberately never produces, so the
 * DOCUMENT is wrong and must be repointed at a select-safe fragment (that is exactly how login
 * broke: the token user fragment pointed at the staff kitchen-sink). A path entry that matches
 * no document is itself a failure — a renamed operation must not silently dissolve the net.
 *
 * A helper annotated with `@fragment-partial` still contributes to a same-file `...SPREAD`, but is
 * not treated as an operation select for model-wide fragment coverage. Use that marker for a
 * nested helper that needs `@prisma-model` so verify-selects can validate its columns.
 *
 * MISSING, non-nullable PARTIAL, and every OPERATION-SCOPED finding set a non-zero exit code.
 *
 * Known blind spots, so nobody reads a clean run as more than it is:
 *   - inline selects written at a call site rather than as a named constant are not attributed
 *   - `...SPREAD` and named select identifiers are resolved only within the same file
 *   - attribution is by a constant's top-level model, so a relation block nested in another
 *     model's select does not count as a separate select for the related model
 *   - models served entirely by generated CRUD have no select constant and are skipped (they are
 *     covered by generated-crud-guards.spec.ts instead)
 * Each of these is counted and printed, so the report says what it did not check.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildSchema, getNamedType, isNonNullType, isObjectType, type GraphQLSchema } from 'graphql'
import {
  buildPrismaSelectFromFragments,
  buildPrismaSelectFromOperationPaths,
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
  /** For kind===other: the bare identifier, when the value is one. */
  ident?: string
}

/** `const NAME = {` / `const NAME = (args) => ({` — where a named select's body starts. */
export const findConstantBody = (source: string, name: string): number => {
  const declaration = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*`).exec(source)
  if (!declaration) return -1
  let cursor = declaration.index + declaration[0].length
  const arrow = /^\([^)]*\)\s*(?::[^=]+)?=>\s*\(?\s*/.exec(source.slice(cursor))
  if (arrow) cursor += arrow[0].length
  return source[cursor] === '{' ? cursor : -1
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
    // `false`, a variable, a call — not a column selection we can attribute directly. Retain a
    // BARE identifier so `select: SOME_SELECT` can resolve against a same-file constant. Requiring
    // the comma/end boundary keeps `someHelper()` and property access from masquerading as one.
    const identifier = /^([A-Za-z_$][\w$]*)\s*(?=,|$)/.exec(source.slice(cursor, close))
    entries.push({ kind: 'other', name: key[1], open: cursor, ident: identifier?.[1] })
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
export const toSelect = (
  source: string,
  open: number,
  seen: ReadonlySet<string> = new Set(),
): PrismaSelect => {
  const select: PrismaSelect = {}
  for (const entry of scanObject(source, open).entries) {
    if (entry.kind === 'true') {
      select[entry.name] = true
      continue
    }
    if (entry.kind === 'other' && entry.ident && !seen.has(entry.ident)) {
      const body = findConstantBody(source, entry.ident)
      if (body !== -1) {
        select[entry.name] = { select: toSelect(source, body, new Set([...seen, entry.ident])) }
      }
      continue
    }
    if (entry.kind !== 'object') continue
    const inner = scanObject(source, entry.open).entries.find(
      candidate => candidate.name === 'select',
    )
    if (inner?.kind === 'object') {
      select[entry.name] = { select: toSelect(source, inner.open, seen) }
      continue
    }
    if (inner?.kind === 'other' && inner.ident && !seen.has(inner.ident)) {
      const body = findConstantBody(source, inner.ident)
      select[entry.name] = {
        select: body === -1 ? {} : toSelect(source, body, new Set([...seen, inner.ident])),
      }
      continue
    }
    select[entry.name] = { select: {} }
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
  /** Fields the constant deliberately never selects (`@select-omits a, b`). */
  omits: string[]
  /** Document positions the constant serves (`@graphql-operations me, UserToken.user`). */
  operations: string[]
  select: PrismaSelect
}

/**
 * Whether requesting `path` on `modelName` errors the whole query when the select omits it.
 * Read from the committed api-schema.graphql, NOT from Prisma metadata: the two disagree —
 * `currentStreak` is non-optional in Prisma (it has a default) but nullable in GraphQL, and it
 * is the GraphQL wrapper that decides null-versus-error at runtime.
 */
export const nonNullableAt = (
  schema: GraphQLSchema,
  modelName: string,
  path: string,
): boolean => {
  let type = schema.getType(modelName)
  const segments = path.split('.')
  for (const [index, segment] of segments.entries()) {
    if (!isObjectType(type)) return false
    const field = type.getFields()[segment]
    if (!field) return false
    if (index === segments.length - 1) return isNonNullType(field.type)
    type = getNamedType(field.type)
  }
  return false
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

/**
 * A comma-separated list annotation (`@select-omits a, b` / `@graphql-operations me, X.y`) in
 * the comment directly preceding a constant. Several lines with the same tag accumulate. The
 * value runs to end of line; a closing comment marker on the same line is stripped so the
 * annotation can sit last in a one-line or block comment.
 */
export const annotationListBefore = (
  raw: string,
  offset: number,
  previousEnd: number,
  tag: string,
): string[] => {
  const window = raw.slice(Math.max(previousEnd, 0), offset)
  return [...window.matchAll(new RegExp(`@${tag}[ \\t]+([^\\n]+)`, 'g'))]
    .flatMap(match => match[1].replace(/\*\/.*$/, '').split(','))
    .map(entry => entry.trim())
    .filter(Boolean)
}

export const readSelectConstants = (
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
        // The regex runs against sanitized source. A preceding JSDoc is whitespace there, so its
        // leading `\s*` can move match.index to the top of the comment and put the annotation
        // behind its own lookup window. The `const` keyword has the same offset in raw and
        // sanitized source and is the stable anchor.
        const declaration = match.index + match[0].indexOf('const')
        const annotated = annotationBefore(raw, declaration, previousEnd)
        const fragmentPartial = /@fragment-partial\b/.test(
          raw.slice(Math.max(previousEnd, 0), declaration),
        )
        const omits = annotationListBefore(raw, declaration, previousEnd, 'select-omits')
        const operations = annotationListBefore(raw, declaration, previousEnd, 'graphql-operations')
        previousEnd = matchingBrace(source, open)
        inFile.set(match[1], { select, spreads })
        if (fragmentPartial) continue
        constants.push({
          file,
          model: modelForConstant(match[1], annotated, models),
          name: match[1],
          omits,
          operations,
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
        const end =
          index + 1 < classes.length ? (classes[index + 1].index ?? source.length) : source.length
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
  const field = models
    .find(model => model.modelName === modelName)
    ?.fields?.find(entry => entry.name === fieldName)
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

/**
 * Whether a select produces the PARENT of a dotted path (trivially true at top level).
 *
 * The consequence of an absent field belongs to the shallowest absent segment: when a select
 * lacks `addresses` entirely, `addresses.id` never resolves at all, so reporting it — let alone
 * as query-fatal — is noise on top of the `addresses` finding. Only a gap whose parent IS
 * produced is a finding of its own, and only then does the field's own nullability decide
 * silent-null versus query-fatal.
 */
export const parentProduced = (have: ReadonlySet<string>, path: string): boolean => {
  const dot = path.lastIndexOf('.')
  return dot === -1 || have.has(path.slice(0, dot))
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
  // The nullability oracle. Committed and CI-verified, so a missing file is a broken
  // checkout, not a condition to soldier through — without it the non-nullable net is off.
  const schema = buildSchema(readFileSync(join(repo, 'api-schema.graphql'), 'utf8'))

  const constants = readSelectConstants(repo, DATABASE_MODELS)
  const operationScoped = constants.filter(constant => constant.operations.length > 0)
  const byModel = new Map<string, SelectConstant[]>()
  for (const constant of constants) {
    // An operation-scoped select answers for ITS documents, not for the model's whole
    // fragment union — holding a self-read to the staff kitchen-sink would only bury
    // real findings under hundreds of false ones.
    if (!constant.model || constant.operations.length > 0) continue
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
  const nonNullPartial: string[] = []
  const operationFindings: string[] = []
  const partial: string[] = []
  const skipped: string[] = []
  let checkedModels = 0
  let checkedPaths = 0
  let resolvedElsewhere = 0

  for (const modelName of [...fragmentModels].sort(alphabetical)) {
    if (!DATABASE_MODELS.some(model => model.modelName === modelName)) continue
    const selects = byModel.get(modelName)
    if (!selects || selects.length === 0) {
      if (!operationScoped.some(constant => constant.model === modelName)) skipped.push(modelName)
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
        missing.push(
          `${modelName}.${path} — produced by none of ${selects.map(s => s.name).join(', ')}`,
        )
      } else if (holders < selects.length) {
        const without = selects.filter((_, index) => !provided[index].has(path))
        const escalated = selects.filter(
          (select, index) =>
            !provided[index].has(path) &&
            !select.omits.includes(path) &&
            parentProduced(provided[index], path),
        )
        if (nonNullableAt(schema, modelName, path) && escalated.length > 0) {
          nonNullPartial.push(
            `${modelName}.${path} — non-nullable, absent from ${escalated.map(s => s.name).join(', ')}: ` +
              `any document those selects serve that requests it fails the WHOLE query. ` +
              `Add the field, or acknowledge a deliberate deny with @select-omits ${path}.`,
          )
        } else {
          partial.push(`${modelName}.${path} — absent from ${without.map(s => s.name).join(', ')}`)
        }
      }
    }
  }

  // Operation-scoped selects: the required set is what documents request at the annotated
  // positions, so ANY gap is a defect of this select or of a document it serves — there is no
  // "another select covers that operation" excuse left to hide behind.
  for (const constant of operationScoped) {
    // A `@graphql-operations` select with no resolvable model can't be checked — but dropping it
    // silently would make the net read green while skipping it. Report it so the gap is visible.
    if (constant.model === undefined) {
      operationFindings.push(
        `${constant.name}: @graphql-operations is set but no @prisma-model resolves — the ` +
          `operation-scoped net cannot check it. Add @prisma-model so the annotation is not silently skipped.`,
      )
      continue
    }
    const model = constant.model
    const { matched, select: required } = buildPrismaSelectFromOperationPaths({
      allSources,
      models: DATABASE_MODELS,
      paths: constant.operations,
      targetModelName: model,
    })
    checkedPaths += constant.operations.length

    for (const [entry, sites] of matched) {
      if (sites === 0) {
        operationFindings.push(
          `${constant.name}: @graphql-operations "${entry}" matches no SDK document — ` +
            `a renamed or deleted operation must not silently dissolve the net; fix or drop the entry.`,
        )
      }
    }

    const { wanted } = requiredPaths(required, model, served, DATABASE_MODELS)
    const have = new Set(flatten(constant.select))
    for (const path of wanted) {
      if (have.has(path)) continue
      if (!parentProduced(have, path)) continue
      if (constant.omits.includes(path)) {
        operationFindings.push(
          `${model}.${path} — DELIBERATELY omitted by ${constant.name} (@select-omits), yet a document ` +
            `on ${constant.operations.join('/')} requests it. The document is wrong, not the select: ` +
            `repoint it at a fragment the select actually produces. Do not add the field.`,
        )
        continue
      }
      const fatal = nonNullableAt(schema, model, path)
      operationFindings.push(
        `${model}.${path} — requested via ${constant.operations.join('/')} but absent from ${constant.name}` +
          (fatal ? ' — non-nullable: the whole query FAILS.' : ' — comes back null silently.'),
      )
    }
  }

  console.log(
    `Checked ${checkedModels} model(s) with both fragments and selects; ` +
      `${operationScoped.length} select(s) checked per-operation against ${checkedPaths} path(s); ` +
      `${constants.length} select constant(s) parsed; ` +
      `${resolvedElsewhere} field(s) skipped as @ResolveField.`,
  )

  if (missing.length > 0) {
    console.log(
      `\nMISSING (${missing.length}) — a fragment asks for these and nothing produces them:`,
    )
    for (const entry of missing.sort(alphabetical)) console.log(`  ${entry}`)
  }

  if (nonNullPartial.length > 0) {
    console.log(
      `\nNON-NULLABLE PARTIAL (${nonNullPartial.length}) — these error the whole query, not a field:`,
    )
    for (const entry of nonNullPartial.sort(alphabetical)) console.log(`  ${entry}`)
  }

  if (operationFindings.length > 0) {
    console.log(
      `\nOPERATION-SCOPED (${operationFindings.length}) — a served document requests what its select does not produce:`,
    )
    for (const entry of operationFindings.sort(alphabetical)) console.log(`  ${entry}`)
  }

  if (verbose && partial.length > 0) {
    console.log(
      `\nPARTIAL (${partial.length}) — advisory; thinner list selects are usually correct:`,
    )
    for (const entry of partial.sort(alphabetical)) console.log(`  ${entry}`)
  } else if (partial.length > 0) {
    console.log(
      `\nPARTIAL: ${partial.length} field(s) present in some selects but not others (--verbose to list).`,
    )
  }

  if (skipped.length > 0) {
    console.log(
      `\nNOT CHECKED (${skipped.length}): no named select constant maps to these models — ` +
        `generated CRUD or inline selects. ${verbose ? skipped.sort(alphabetical).join(', ') : '--verbose to list'}`,
    )
  }

  const failures = missing.length + nonNullPartial.length + operationFindings.length
  if (failures === 0) console.log('\nNo fragment field is unproduced by its model’s selects.')
  process.exitCode = failures > 0 ? 1 : 0
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
