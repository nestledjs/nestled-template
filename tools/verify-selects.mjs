#!/usr/bin/env node
/**
 * Verify explicit Prisma select constants against the database schema.
 *
 * The admin-CRUD boundary migration replaces createSelect(info) with explicit select constants.
 * createSelect filtered GraphQL-only @ResolveField values through DATABASE_MODELS before they
 * reached Prisma. An explicit select has no runtime filter, TypeScript can accept extra fields,
 * and mocked unit tests do not ask Prisma to validate the query. A bad field therefore fails only
 * when an authenticated operation executes against a real database.
 *
 * This tool reports fields that Prisma cannot select, empty nested selects left by unresolved
 * fragments, and constants whose Prisma model cannot be inferred.
 *
 * Usage:
 *   node tools/verify-selects.mjs [--json] [root ...]
 *
 * Model resolution uses the constant name, an unambiguous relation name, and then the filename.
 * Override an ambiguous constant with a comment immediately before it:
 *
 *   /** @prisma-model GroupMember *\/
 *   export const SETTINGS_SELECT = { ... }
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SCHEMA_DIRECTORY_CANDIDATES = [
  'libs/api/prisma/src/lib/schemas',
  'prisma',
  'libs/api/prisma/src/lib',
]

export const DEFAULT_SEARCH_ROOTS = ['libs/api/custom/src', 'libs/api/core', 'apps/api/src']

const STRUCTURAL_KEYS = new Set([
  'select',
  'where',
  'orderBy',
  'take',
  'skip',
  'include',
  'distinct',
])

const alphabetical = (left, right) => left.localeCompare(right)
const normalizePath = path => path.replaceAll('\\', '/')

const schemaDirectory = cwd =>
  SCHEMA_DIRECTORY_CANDIDATES.map(candidate => resolve(cwd, candidate)).find(
    candidate =>
      existsSync(candidate) && readdirSync(candidate).some(file => file.endsWith('.prisma')),
  )

const readDatamodel = cwd => {
  const directory = schemaDirectory(cwd)
  if (!directory) {
    throw new Error(`No .prisma schema found under: ${SCHEMA_DIRECTORY_CANDIDATES.join(', ')}`)
  }

  return readdirSync(directory)
    .filter(file => file.endsWith('.prisma'))
    .sort(alphabetical)
    .map(file => readFileSync(join(directory, file), 'utf8'))
    .join('\n')
}

const modelsFromDmmf = dmmf =>
  Object.fromEntries(
    dmmf.datamodel.models.map(model => [
      model.name,
      Object.fromEntries(
        model.fields.map(field => [field.name, field.kind === 'object' ? field.type : null]),
      ),
    ]),
  )

export const parseDatamodelFallback = datamodel => {
  const models = {}
  let modelName
  let fields

  for (const line of datamodel.split('\n')) {
    if (!modelName) {
      const modelMatch = /^\s*model\s+(\w+)\s*\{/.exec(line)
      if (modelMatch) {
        modelName = modelMatch[1]
        fields = {}
      }
      continue
    }

    if (/^\s*\}/.test(line)) {
      models[modelName] = fields
      modelName = undefined
      fields = undefined
      continue
    }

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue
    const [name, rawType] = trimmed.split(/\s+/)
    if (!rawType) continue
    const type = rawType.replaceAll('[', '').replaceAll(']', '').replaceAll('?', '')
    fields[name] = /^[A-Z]/.test(type) ? type : null
  }

  for (const fields of Object.values(models)) {
    for (const [field, relationTarget] of Object.entries(fields)) {
      if (relationTarget && !models[relationTarget]) fields[field] = null
    }
  }
  return models
}

const defaultInternalsLoader = () => import('@prisma/internals')

export const loadModels = async ({
  cwd = process.cwd(),
  internalsLoader = defaultInternalsLoader,
} = {}) => {
  const datamodel = readDatamodel(cwd)
  try {
    const internals = await internalsLoader()
    const getDMMF = internals.default?.getDMMF ?? internals.getDMMF
    if (typeof getDMMF !== 'function') throw new Error('@prisma/internals has no getDMMF export')
    const dmmf = await getDMMF({ datamodel })
    return { models: modelsFromDmmf(dmmf), source: '@prisma/internals' }
  } catch {
    return { models: parseDatamodelFallback(datamodel), source: 'regex fallback' }
  }
}

const displayPath = (cwd, path) => {
  const pathFromCwd = relative(cwd, path)
  return normalizePath(pathFromCwd.startsWith('..') ? path : pathFromCwd)
}

export const findSelectFiles = ({ cwd = process.cwd(), roots = DEFAULT_SEARCH_ROOTS } = {}) => {
  const files = []
  const walk = directory => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules') continue
      const path = join(directory, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (entry.endsWith('.select.ts')) {
        files.push({ absolutePath: path, file: displayPath(cwd, path) })
      }
    }
  }

  for (const root of roots) walk(isAbsolute(root) ? root : resolve(cwd, root))
  return files.sort((left, right) => left.file.localeCompare(right.file))
}

const skipLineComment = (source, start) => {
  let index = start
  while (index < source.length && source[index] !== '\n') index += 1
  return index
}

const skipBlockComment = (source, start) => {
  let index = start
  while (index < source.length) {
    if (source[index] === '*' && source[index + 1] === '/') {
      return index + 2
    }
    index += 1
  }
  return index
}

const copyQuotedValue = (source, start) => {
  const quote = source[start]
  let index = start + 1
  while (index < source.length) {
    if (source[index] === '\\') index += 2
    else if (source[index] === quote) return index + 1
    else index += 1
  }
  return index
}

const maskRange = source => source.replace(/[^\n]/g, ' ')

const sanitizeSource = source => {
  let result = ''
  let index = 0
  while (index < source.length) {
    const character = source[index]
    const next = source[index + 1]
    if (character === '/' && next === '/') {
      const end = skipLineComment(source, index + 2)
      result += maskRange(source.slice(index, end))
      index = end
    } else if (character === '/' && next === '*') {
      const end = skipBlockComment(source, index + 2)
      result += maskRange(source.slice(index, end))
      index = end
    } else if (character === "'" || character === '"' || character === '`') {
      const end = copyQuotedValue(source, index)
      result += maskRange(source.slice(index, end))
      index = end
    } else {
      result += character
      index += 1
    }
  }
  return result
}

const closingBrace = (source, start) => {
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

const nestedSelectIsEmpty = (source, start) => {
  const close = closingBrace(source, start)
  if (close === -1) return false
  const inner = source.slice(start + 1, close).replace(/select\s*:/g, '')
  return !/\w/.test(inner)
}

const addFieldProblem = (problems, context, field) => {
  if (!(field in context.models[context.model])) {
    problems.push({
      file: context.file,
      path: [...context.path, field].join('.'),
      model: context.model,
      kind: 'not-a-column',
    })
  }
}

const addEmptySelectProblem = (problems, context, field) => {
  problems.push({
    file: context.file,
    path: [...context.path, field].join('.'),
    model: context.model,
    kind: 'empty-select',
  })
}

const checkProperty = (source, index, context, problems) => {
  const match = /^(\w+)\s*:\s*/.exec(source.slice(index))
  if (!match) return index + 1

  const field = match[1]
  const valueStart = index + match[0].length
  if (STRUCTURAL_KEYS.has(field)) {
    return source[valueStart] === '{'
      ? checkBlock(source, valueStart + 1, context, problems)
      : valueStart
  }
  if (!context.models[context.model]) return valueStart

  addFieldProblem(problems, context, field)
  const relationTarget = context.models[context.model][field]
  if (source[valueStart] !== '{') return valueStart
  if (nestedSelectIsEmpty(source, valueStart)) addEmptySelectProblem(problems, context, field)

  return checkBlock(
    source,
    valueStart + 1,
    {
      ...context,
      model: relationTarget || context.model,
      path: relationTarget ? [...context.path, field] : context.path,
    },
    problems,
  )
}

function checkBlock(source, start, context, problems) {
  let depth = 1
  let index = start
  while (index < source.length && depth > 0) {
    if (source[index] === '{') {
      depth += 1
      index += 1
    } else if (source[index] === '}') {
      depth -= 1
      index += 1
    } else {
      index = checkProperty(source, index, context, problems)
    }
  }
  return index
}

const pascalCase = value =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join('')

const constantModelCandidates = constantName => {
  const words = constantName
    .replace(/_?SELECT.*$/, '')
    .split('_')
    .filter(Boolean)
  const candidates = []
  for (let length = words.length; length > 0; length -= 1) {
    for (let start = 0; start + length <= words.length; start += 1) {
      candidates.push(pascalCase(words.slice(start, start + length).join('_')))
    }
  }
  return candidates
}

const relationTargetForConstant = (models, constantName) => {
  const words = constantName
    .replace(/_?SELECT.*$/, '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
  const relationName = words
    .map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('')
  const targets = new Set(
    Object.values(models)
      .map(fields => fields[relationName])
      .filter(Boolean),
  )
  return targets.size === 1 ? [...targets][0] : null
}

export const resolveModel = (models, constantName, file, annotatedModel) => {
  if (annotatedModel) return models[annotatedModel] ? annotatedModel : null

  for (const candidate of constantModelCandidates(constantName)) {
    if (models[candidate]) return candidate
  }

  const relationTarget = relationTargetForConstant(models, constantName)
  if (relationTarget) return relationTarget

  const fromFile = pascalCase(basename(file).replace('.select.ts', ''))
  return models[fromFile] ? fromFile : null
}

const annotationBefore = (rawSource, constantOffset, previousConstantOffset) => {
  const gap = rawSource.slice(previousConstantOffset, constantOffset)
  return [...gap.matchAll(/@prisma-model\s+(\w+)/g)].pop()?.[1]
}

const verifyFile = ({ absolutePath, file }, models) => {
  const rawSource = readFileSync(absolutePath, 'utf8')
  const source = sanitizeSource(rawSource)
  const problems = []
  const unresolved = []
  let previousConstantOffset = 0

  for (const match of source.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*\{/g)) {
    const constantOffset = match.index
    const annotatedModel = annotationBefore(rawSource, constantOffset, previousConstantOffset)
    const model = resolveModel(models, match[1], file, annotatedModel)
    previousConstantOffset = constantOffset

    if (!model) {
      unresolved.push({ file, const: match[1] })
      continue
    }

    checkBlock(
      source,
      match.index + match[0].length,
      { models, file, model, path: [match[1]] },
      problems,
    )
  }

  return { problems, unresolved }
}

export const verifySelects = async ({
  cwd = process.cwd(),
  roots = DEFAULT_SEARCH_ROOTS,
  internalsLoader = defaultInternalsLoader,
} = {}) => {
  const { models, source } = await loadModels({ cwd, internalsLoader })
  const files = findSelectFiles({ cwd, roots })
  const problems = []
  const unresolved = []

  for (const file of files) {
    const result = verifyFile(file, models)
    problems.push(...result.problems)
    unresolved.push(...result.unresolved)
  }

  return { source, files: files.length, problems, unresolved }
}

const usage = `Usage:
  node tools/verify-selects.mjs [--json] [root ...]

Validates every *.select.ts constant under the configured roots against the Prisma schema.`

const renderText = result => {
  const lines = [`verify-selects — ${result.files} file(s), schema via ${result.source}`, '']
  for (const problem of result.problems) {
    const reason =
      problem.kind === 'empty-select'
        ? 'EMPTY select (invalid Prisma, selects nothing)'
        : `not a column on ${problem.model}`
    lines.push(`  ${problem.file}`, `      ${problem.path}  — ${reason}`)
  }
  for (const unresolved of result.unresolved) {
    lines.push(
      `  ${unresolved.file}`,
      `      ${unresolved.const}  — cannot resolve model; add /** @prisma-model X */`,
    )
  }
  lines.push(
    result.problems.length || result.unresolved.length
      ? `\n${result.problems.length} problem(s), ${result.unresolved.length} unresolved`
      : '\nall selects verify against the schema',
  )
  return lines.join('\n')
}

const parseArguments = arguments_ => {
  const asJson = arguments_.includes('--json')
  const unknownOptions = arguments_.filter(
    argument => argument.startsWith('--') && argument !== '--json' && argument !== '--',
  )
  if (unknownOptions.length > 0) throw new Error(`Unknown option(s): ${unknownOptions.join(', ')}`)
  return { asJson, roots: arguments_.filter(argument => !argument.startsWith('--')) }
}

const errorMessage = error => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return JSON.stringify(error) ?? 'Unknown verify-selects failure'
}

export const runCli = async (arguments_ = process.argv.slice(2), cwd = process.cwd()) => {
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    console.log(usage)
    return 0
  }

  let asJson = arguments_.includes('--json')
  try {
    const parsed = parseArguments(arguments_)
    asJson = parsed.asJson
    const result = await verifySelects({
      cwd,
      roots: parsed.roots.length > 0 ? parsed.roots : DEFAULT_SEARCH_ROOTS,
    })
    console.log(asJson ? JSON.stringify(result, null, 2) : renderText(result))
    return result.problems.length || result.unresolved.length ? 1 : 0
  } catch (error) {
    const message = errorMessage(error)
    if (asJson) console.log(JSON.stringify({ error: message }, null, 2))
    else console.error(message)
    return 2
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) process.exitCode = await runCli()
