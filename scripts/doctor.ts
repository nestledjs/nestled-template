import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

type Finding = {
  check: string
  message: string
  file?: string
  line?: number
}

const failures: Finding[] = []
const warnings: Finding[] = []

const routeRoot = 'apps/web/app/routes'
const routeConfigPath = 'apps/web/app/routes.tsx'
const schemaPath = 'libs/api/prisma/src/lib/schemas/schema.prisma'
const notesDir = '.nestled-updates/upgrade-notes'
const guardBaselinePath = '.nestled-updates/security/guard-baseline.json'
const gitBaseRef = process.env.NX_BASE || process.env.GITHUB_BASE_REF || 'develop'
const shouldUpdateGuardBaseline = process.argv.includes('--update-guard-baseline')
const sourceTemplateRemotePattern = /github\.com[:/]nestledjs\/nestled-(?:dev-)?template(?:\.git)?$/

type GuardBaseline = Record<string, Record<string, string[]>>

const fail = (check: string, message: string, file?: string, line?: number) => {
  failures.push({ check, message, file, line })
}

const warn = (check: string, message: string, file?: string, line?: number) => {
  warnings.push({ check, message, file, line })
}

const getChangedLineMap = (): Map<string, Set<number>> => {
  const changedLines = new Map<string, Set<number>>()

  const recordDiffLines = (diff: string) => {
    let currentFile = ''

    for (const line of diff.split('\n')) {
      const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line)
      if (fileMatch) {
        currentFile = fileMatch[1]
        if (!changedLines.has(currentFile)) changedLines.set(currentFile, new Set())
        continue
      }

      const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
      if (!hunkMatch || !currentFile) continue

      const start = Number(hunkMatch[1])
      const count = Number(hunkMatch[2] ?? '1')
      const lines = changedLines.get(currentFile)
      if (!lines) continue

      for (let index = 0; index < count; index += 1) {
        lines.add(start + index)
      }
    }
  }

  const diffCommands = [
    `git diff --unified=0 ${gitBaseRef}...HEAD -- '*.ts' '*.tsx'`,
    `git diff --cached --unified=0 -- '*.ts' '*.tsx'`,
    `git diff --unified=0 -- '*.ts' '*.tsx'`,
  ]

  for (const command of diffCommands) {
    try {
      recordDiffLines(
        execSync(command, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      )
    } catch {
      continue
    }
  }

  return changedLines
}

const changedLineMap = getChangedLineMap()

const isChangedLine = (file: string | undefined, line: number | undefined): boolean => {
  if (!file || !line) return false
  return changedLineMap.get(file)?.has(line) ?? false
}

const review = (check: string, message: string, file?: string, line?: number) => {
  if (isChangedLine(file, line)) {
    fail(check, `New changed-line finding: ${message}`, file, line)
  } else {
    warn(check, message, file, line)
  }
}

const getCommandOutput = (command: string): string => {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const isSourceTemplateRepository = (): boolean => {
  if (process.env.NESTLED_TEMPLATE_SOURCE === 'true') return true
  if (process.env.NESTLED_TEMPLATE_SOURCE === 'false') return false

  const originUrl = getCommandOutput('git remote get-url origin')
  return sourceTemplateRemotePattern.test(originUrl)
}

const getChangedFiles = (): string[] => {
  const files = new Set<string>()
  const commands = [
    `git diff --name-only ${gitBaseRef}...HEAD`,
    'git diff --cached --name-only',
    'git diff --name-only',
  ]

  for (const command of commands) {
    const output = getCommandOutput(command)
    if (!output) continue

    for (const file of output.split('\n')) {
      if (file.trim()) files.add(file)
    }
  }

  return Array.from(files).sort((left, right) => left.localeCompare(right))
}

const walkFiles = (dir: string, predicate: (path: string) => boolean): string[] => {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (
        entry === 'node_modules' ||
        entry === 'dist' ||
        entry === 'build' ||
        entry === '.nx' ||
        entry === '.git' ||
        entry === '.claude'
      ) {
        continue
      }
      files.push(...walkFiles(path, predicate))
    } else if (stat.isFile() && predicate(path)) {
      files.push(path)
    }
  }
  return files
}

const directFiles = (dir: string, predicate: (path: string) => boolean): string[] => {
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .map(entry => join(dir, entry))
    .filter(path => statSync(path).isFile() && predicate(path))
}

const getRegexMatches = (pattern: RegExp, source: string): RegExpExecArray[] => {
  pattern.lastIndex = 0
  const matches: RegExpExecArray[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    matches.push(match)
    if (match[0] === '') {
      pattern.lastIndex += 1
    }
  }

  return matches
}

const startsWithBlockComment = (source: string, index: number): boolean =>
  source[index] === '/' && source[index + 1] === '*'

const startsWithLineComment = (
  source: string,
  index: number,
  onlyWhitespaceOnLine: boolean,
): boolean => onlyWhitespaceOnLine && source[index] === '/' && source[index + 1] === '/'

const skipBlockComment = (
  source: string,
  startIndex: number,
): { index: number; preservedNewlines: string } => {
  let index = startIndex + 2
  let preservedNewlines = ''

  while (index < source.length) {
    if (source[index] === '\n') {
      preservedNewlines += '\n'
      index += 1
    } else if (source[index] === '*' && source[index + 1] === '/') {
      index += 2
      break
    } else {
      index += 1
    }
  }

  return { index, preservedNewlines }
}

const skipLineComment = (source: string, startIndex: number): number => {
  let index = startIndex
  while (index < source.length && source[index] !== '\n') {
    index += 1
  }
  return index
}

const updateWhitespaceState = (current: string, onlyWhitespaceOnLine: boolean): boolean => {
  if (current === '\n') return true
  if (current === ' ' || current === '\t' || current === '\r') return onlyWhitespaceOnLine
  return false
}

const stripComments = (source: string): string => {
  let output = ''
  let index = 0
  let onlyWhitespaceOnLine = true

  while (index < source.length) {
    if (startsWithBlockComment(source, index)) {
      const skipped = skipBlockComment(source, index)
      output += skipped.preservedNewlines
      onlyWhitespaceOnLine = skipped.preservedNewlines.length > 0 || onlyWhitespaceOnLine
      index = skipped.index
    } else if (startsWithLineComment(source, index, onlyWhitespaceOnLine)) {
      index = skipLineComment(source, index)
    } else {
      output += source[index]
      onlyWhitespaceOnLine = updateWhitespaceState(source[index], onlyWhitespaceOnLine)
      index += 1
    }
  }

  return output
}

const getRegisteredRouteFiles = (): Set<string> => {
  if (!existsSync(routeConfigPath)) {
    fail('routes', 'Route configuration file is missing', routeConfigPath)
    return new Set()
  }

  const routeConfig = stripComments(readFileSync(routeConfigPath, 'utf8'))
  const registered = new Set<string>()
  const routeFilePattern = /['"]\.\/routes\/([^'"]+\.(?:tsx|ts))['"]/g

  for (const match of getRegexMatches(routeFilePattern, routeConfig)) {
    registered.add(join(routeRoot, match[1]))
  }

  return registered
}

const isRouteHelperFile = (path: string): boolean => {
  const file = basename(path)
  if (file.endsWith('.spec.ts') || file.endsWith('.spec.tsx')) return true
  if (file === 'route.ts' || file === 'routes.tsx') return true
  if (file === '_layout.tsx' || file === '_index.tsx') return false
  return file.startsWith('_')
}

const checkRoutes = () => {
  const registered = getRegisteredRouteFiles()
  const routeFiles = walkFiles(
    routeRoot,
    path => (path.endsWith('.tsx') || path.endsWith('.ts')) && !isRouteHelperFile(path),
  )

  for (const file of routeFiles) {
    if (!registered.has(file)) {
      fail('routes', `Route file is not registered in ${routeConfigPath}`, file)
    }
  }

  for (const file of registered) {
    if (!existsSync(file)) {
      fail('routes', 'Registered route file does not exist', file)
    }
  }
}

const checkForbiddenPrismaImports = () => {
  const files = walkFiles(
    '.',
    path =>
      /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path) &&
      !path.includes('/node_modules/') &&
      !path.includes('/build/') &&
      !path.includes('/dist/') &&
      !path.includes('/libs/shared/sdk/src/generated/') &&
      !path.includes('/libs/api/generated-crud/'),
  )

  const directImportPattern =
    /(?:from\s+['"]@prisma\/client['"]|require\(['"]@prisma\/client['"]\))/g

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (directImportPattern.test(source)) {
      fail(
        'prisma-imports',
        'Import Prisma types from @nestled-template/api/prisma instead of @prisma/client',
        file,
      )
    }
  }
}

const checkStaleConfigNames = () => {
  const files = walkFiles(
    '.',
    path =>
      /\.(ts|tsx|js|jsx|mjs|cjs|md|yml|yaml|json)$/.test(path) &&
      path !== 'scripts/doctor.ts' &&
      !path.includes('/node_modules/') &&
      !path.includes('/build/') &&
      !path.includes('/dist/'),
  )

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (source.includes('frontendUrl') || source.includes('frontend.url')) {
      fail('config-names', 'Use siteUrl/SITE_URL instead of frontendUrl/frontend.url', file)
    }
  }
}

const checkMcpWiring = () => {
  const mcpModulePath = 'libs/api/custom/src/lib/plugins/mcp/mcp.module.ts'
  if (!existsSync(mcpModulePath)) return

  const appModulePath = 'apps/api/src/app.module.ts'
  const mainPath = 'apps/api/src/main.ts'
  const appModule = existsSync(appModulePath) ? readFileSync(appModulePath, 'utf8') : ''
  const main = existsSync(mainPath) ? readFileSync(mainPath, 'utf8') : ''

  if (!appModule.includes('McpModule')) {
    fail('mcp', 'McpModule exists but is not registered in the API app module', appModulePath)
  }

  if (!main.includes('/api/mcp')) {
    fail('mcp', 'MCP endpoints are not allowed by the early API request filter', mainPath)
  }
}

const normalizePath = (path: string): string =>
  `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'

const getDecoratorPath = (decoratorArgs: string | undefined): string => {
  if (!decoratorArgs) return ''

  const trimmed = decoratorArgs.trim()
  if (!trimmed) return ''

  const literalMatch = /^['"`]([^'"`]*)['"`]/.exec(trimmed)
  return literalMatch?.[1] ?? ''
}

const toApiRoute = (controllerPath: string, methodPath: string): string => {
  const combined = normalizePath(`${controllerPath}/${methodPath}`)
  if (combined === '/api' || combined.startsWith('/api/')) {
    return combined
  }
  return normalizePath(`/api${combined}`)
}

const getAllowedApiPrefixes = (): string[] => {
  const mainPath = 'apps/api/src/main.ts'
  if (!existsSync(mainPath)) {
    fail('api-routes', 'API bootstrap file is missing', mainPath)
    return []
  }

  const source = stripComments(readFileSync(mainPath, 'utf8'))
  const match = /const\s+VALID_API_PREFIXES\s*=\s*\[([\s\S]*?)\]/.exec(source)
  if (!match) {
    fail('api-routes', 'VALID_API_PREFIXES could not be found', mainPath)
    return []
  }

  return getRegexMatches(/['"`]([^'"`]+)['"`]/g, match[1]).map(item => normalizePath(item[1]))
}

const isControllerCandidateFile = (path: string): boolean =>
  path.endsWith('.ts') &&
  !path.includes('/node_modules/') &&
  !path.includes('/build/') &&
  !path.includes('/dist/') &&
  !path.includes('/libs/api/generated-crud/') &&
  !path.endsWith('.spec.ts')

const getControllerClassSources = (source: string): { path: string; source: string }[] => {
  const controllers = getRegexMatches(/@Controller\s*\(([^)]*)\)/g, source)
  return controllers.map((controllerMatch, index) => {
    const classStart = controllerMatch.index
    const nextControllerIndex = controllers[index + 1]?.index ?? source.length
    return {
      path: getDecoratorPath(controllerMatch[1]),
      source: source.slice(classStart, nextControllerIndex),
    }
  })
}

const getHttpMethodPaths = (source: string): string[] =>
  getRegexMatches(/@(Get|Post|Put|Patch|Delete|All)\s*(?:\(([^)]*)\))?/g, source).map(match =>
    getDecoratorPath(match[2]),
  )

const checkControllerMethodPaths = (
  file: string,
  controllerPath: string,
  methodPaths: string[],
  allowedPrefixes: string[],
) => {
  if (methodPaths.length === 0) {
    warn('api-routes', 'Controller has no HTTP method decorators to check', file)
    return
  }

  for (const methodPath of methodPaths) {
    const routePath = toApiRoute(controllerPath, methodPath)
    const isAllowed = allowedPrefixes.some(prefix => routePath.startsWith(prefix))
    if (!isAllowed) {
      fail(
        'api-routes',
        `Registered API route ${routePath} is not covered by VALID_API_PREFIXES`,
        file,
      )
    }
  }
}

const checkApiControllerRoutesAllowed = () => {
  const allowedPrefixes = getAllowedApiPrefixes()
  if (allowedPrefixes.length === 0) return

  const controllerFiles = walkFiles('.', isControllerCandidateFile)

  for (const file of controllerFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    if (!source.includes('@Controller')) continue

    for (const controller of getControllerClassSources(source)) {
      checkControllerMethodPaths(
        file,
        controller.path,
        getHttpMethodPaths(controller.source),
        allowedPrefixes,
      )
    }
  }
}

const getGraphqlResolverMethods = (source: string): string[] =>
  getRegexMatches(/^\s{2}(?:override\s+)?(?:async\s+)?(\w+)\s*\(/gm, source)
    .map(match => match[1])
    .filter(methodName => methodName !== 'constructor')

const getGraphqlOperationMethods = (
  source: string,
): { decorators: string; name: string; body: string; line: number }[] => {
  const methods: { decorators: string; name: string; body: string; line: number }[] = []
  const lines = source.split('\n')
  let offset = 0
  let decorators = ''
  let lineNumber = 1

  for (const line of lines) {
    const methodMatch = /^\s{2}(?:override\s+)?(?:async\s+)?(\w+)\s*\(/.exec(line)
    if (methodMatch && decorators.includes('@')) {
      if (/@(?:Query|Mutation|Subscription)\b/.test(decorators)) {
        const lineIndex = source.indexOf(line, offset)
        const openingBraceIndex = source.indexOf('{', lineIndex)
        methods.push({
          decorators,
          name: methodMatch[1],
          body: openingBraceIndex === -1 ? '' : getBlockSource(source, openingBraceIndex),
          line: lineNumber,
        })
      }
      decorators = ''
    } else if (/^\s{2}@/.test(line) || (decorators && /^\s{4}/.test(line))) {
      decorators += `${line}\n`
    } else if (line.trim() !== '') {
      decorators = ''
    }

    offset += line.length + 1
    lineNumber += 1
  }

  return methods
}

const getBlockSource = (source: string, openingBraceIndex: number): string => {
  let depth = 0
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1
    } else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openingBraceIndex, index + 1)
    }
  }

  return source.slice(openingBraceIndex)
}

const getGuardNames = (source: string): string[] => {
  const guards = new Set<string>()
  for (const match of getRegexMatches(/@UseGuards\s*\(([^)]*)\)/g, source)) {
    for (const guard of getRegexMatches(/\b[A-Z]\w*Guard\b/g, match[1])) {
      guards.add(guard[0])
    }
  }
  return [...guards].sort((left, right) => left.localeCompare(right))
}

const getClassGuardNames = (source: string): string[] => {
  const classIndex = source.indexOf('export class ')
  if (classIndex === -1) return []

  const decoratorLines: string[] = []
  const lines = source.slice(0, classIndex).split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    if (!line.trimStart().startsWith('@')) break
    decoratorLines.unshift(line)
  }

  return getGuardNames(decoratorLines.join('\n'))
}

const getLineNumber = (source: string, index: number): number =>
  source.slice(0, index).split('\n').length

const getGeneratedCrudMethodNames = (): Set<string> => {
  const generatedResolverFiles = walkFiles('libs/api/generated-crud/feature/src/lib', path =>
    path.endsWith('.resolver.ts'),
  )
  const methodNames = new Set<string>()

  for (const file of generatedResolverFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const methodName of getGraphqlResolverMethods(source)) {
      methodNames.add(methodName)
    }
  }

  return methodNames
}

const getCanonicalDefaultResolverPath = (file: string): string => {
  const folderName = basename(dirname(file))
  return join(dirname(file), `${folderName}.resolver.ts`)
}

const checkDefaultResolverInheritance = (file: string, source: string) => {
  if (file !== getCanonicalDefaultResolverPath(file)) return
  if (source.includes('extends Generated')) return

  fail(
    'api-names',
    'Default model resolver must extend its generated resolver to keep admin CRUD registered',
    file,
  )
}

const checkResolverMethodName = (
  file: string,
  methodName: string,
  generatedMethodNames: Set<string>,
) => {
  if (generatedMethodNames.has(methodName)) {
    fail(
      'api-names',
      `Custom resolver method "${methodName}" collides with a generated CRUD field name`,
      file,
    )
  }

  if (/^admin[A-Z]/.test(methodName)) {
    fail(
      'api-names',
      `Custom default resolver method "${methodName}" uses reserved admin* naming`,
      file,
    )
  }
}

const checkDefaultResolverFile = (file: string, generatedMethodNames: Set<string>) => {
  const source = stripComments(readFileSync(file, 'utf8'))
  checkDefaultResolverInheritance(file, source)

  for (const methodName of getGraphqlResolverMethods(source)) {
    checkResolverMethodName(file, methodName, generatedMethodNames)
  }
}

const checkDefaultResolverGeneratedNameCollisions = () => {
  const generatedMethodNames = getGeneratedCrudMethodNames()
  if (generatedMethodNames.size === 0) {
    fail('api-names', 'Generated CRUD method names could not be discovered')
    return
  }

  const defaultResolverFiles = walkFiles('libs/api/custom/src/lib/default', path =>
    path.endsWith('.resolver.ts'),
  )

  for (const file of defaultResolverFiles) {
    checkDefaultResolverFile(file, generatedMethodNames)
  }
}

const checkHandwrittenAdminSdkOperations = () => {
  const graphqlFiles = walkFiles('libs/shared/sdk/src/graphql', path => path.endsWith('.graphql'))

  for (const file of graphqlFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    const adminOperation = /\b(?:query|mutation|subscription)\s+__Admin\w+/.exec(source)
    if (adminOperation) {
      fail(
        'api-names',
        'Hand-written __Admin* SDK operations belong under libs/shared/sdk/src/__admin',
        file,
      )
    }
  }
}

const pascalCase = (value: string): string =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

const getModuleClasses = (source: string): string[] =>
  getRegexMatches(/export\s+class\s+(\w+Module)\b/g, source).map(match => match[1])

const isExportedFromIndex = (source: string, path: string): boolean =>
  source.includes(`'./${path}'`) || source.includes(`"./${path}"`)

const validatePluginModuleFile = (moduleFile: string, pluginIndex: string, appModule: string) => {
  const moduleSource = readFileSync(moduleFile, 'utf8')
  const moduleBasename = basename(moduleFile, '.ts')

  if (!isExportedFromIndex(pluginIndex, moduleBasename)) {
    fail('plugin-structure', 'Plugin module is not exported from its index.ts', moduleFile)
  }

  for (const moduleClass of getModuleClasses(moduleSource)) {
    if (!appModule.includes(moduleClass)) {
      fail(
        'plugin-structure',
        'Plugin module is not registered in apps/api/src/app.module.ts',
        moduleFile,
      )
    }
  }
}

const validatePluginDirectory = (
  entry: string,
  pluginsRoot: string,
  rootIndex: string,
  appModule: string,
) => {
  const pluginDir = join(pluginsRoot, entry)
  if (!statSync(pluginDir).isDirectory()) return

  const indexPath = join(pluginDir, 'index.ts')
  const moduleFiles = walkFiles(pluginDir, path => path.endsWith('.module.ts'))
  if (moduleFiles.length === 0) return

  if (!existsSync(indexPath)) {
    fail('plugin-structure', 'Plugin with module is missing index.ts barrel', indexPath)
    return
  }

  if (!isExportedFromIndex(rootIndex, entry)) {
    fail('plugin-structure', 'Plugin is not exported from plugins/index.ts', pluginDir)
  }

  const pluginIndex = readFileSync(indexPath, 'utf8')
  for (const moduleFile of moduleFiles) {
    validatePluginModuleFile(moduleFile, pluginIndex, appModule)
  }
}

const checkPluginExportsAndRegistration = () => {
  const pluginsRoot = 'libs/api/custom/src/lib/plugins'
  if (!existsSync(pluginsRoot)) return

  const rootIndexPath = join(pluginsRoot, 'index.ts')
  const appModulePath = 'apps/api/src/app.module.ts'
  const rootIndex = existsSync(rootIndexPath) ? readFileSync(rootIndexPath, 'utf8') : ''
  const appModule = existsSync(appModulePath) ? readFileSync(appModulePath, 'utf8') : ''

  for (const entry of readdirSync(pluginsRoot)) {
    validatePluginDirectory(entry, pluginsRoot, rootIndex, appModule)
  }
}

const getIntegrationFiles = (integrationDir: string): string[] => [
  ...directFiles(integrationDir, path => path.endsWith('.module.ts')),
  ...directFiles(integrationDir, path => path.endsWith('.service.ts')),
]

const validateIntegrationDirectory = (
  entry: string,
  integrationsRoot: string,
  rootIndex: string,
) => {
  const integrationDir = join(integrationsRoot, entry)
  if (!statSync(integrationDir).isDirectory()) return

  const indexPath = join(integrationDir, 'index.ts')
  const integrationFiles = getIntegrationFiles(integrationDir)
  if (integrationFiles.length === 0) return

  if (!existsSync(indexPath)) {
    fail(
      'integration-structure',
      'Integration with service/module is missing index.ts barrel',
      indexPath,
    )
    return
  }

  if (!rootIndex.includes(`'./lib/${entry}'`) && !rootIndex.includes(`"./lib/${entry}"`)) {
    fail(
      'integration-structure',
      'Integration is not exported from integrations/src/index.ts',
      integrationDir,
    )
  }

  const integrationIndex = readFileSync(indexPath, 'utf8')
  for (const integrationFile of integrationFiles) {
    const expectedBasename = basename(integrationFile, '.ts')
    if (!isExportedFromIndex(integrationIndex, expectedBasename)) {
      fail(
        'integration-structure',
        'Integration module/service is not exported from its index.ts',
        integrationFile,
      )
    }
  }
}

const checkIntegrationExports = () => {
  const integrationsRoot = 'libs/api/integrations/src/lib'
  const rootIndexPath = 'libs/api/integrations/src/index.ts'
  if (!existsSync(integrationsRoot)) return

  const rootIndex = existsSync(rootIndexPath) ? readFileSync(rootIndexPath, 'utf8') : ''

  for (const entry of readdirSync(integrationsRoot)) {
    validateIntegrationDirectory(entry, integrationsRoot, rootIndex)
  }
}

const checkSkipCrudDocumentation = () => {
  if (!existsSync(schemaPath)) return

  const lines = readFileSync(schemaPath, 'utf8').split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('@skipCrud')) continue

    const context = lines
      .slice(index, index + 5)
      .join(' ')
      .toLowerCase()
    const hasSecurityExplanation =
      context.includes('security') ||
      context.includes('credential') ||
      context.includes('password') ||
      context.includes('secret') ||
      context.includes('token') ||
      context.includes('internal')

    if (!hasSecurityExplanation) {
      fail(
        'skip-crud',
        '@skipCrud must include an adjacent security-sensitive internal model explanation',
        `${schemaPath}:${index + 1}`,
      )
    }
  }
}

const checkPublishablePackageReadmes = () => {
  const packageFiles = walkFiles('libs', path => basename(path) === 'package.json')

  for (const file of packageFiles) {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
      name?: string
      publishConfig?: unknown
      private?: boolean
    }
    const isPublishable = !pkg.private && (pkg.publishConfig || pkg.name?.startsWith('@nestledjs/'))
    if (!isPublishable) continue

    const readmePath = join(dirname(file), 'README.md')
    if (!existsSync(readmePath)) {
      fail('package-readmes', 'Publishable package is missing README.md', readmePath)
    }
  }
}

const readGuardBaseline = (): GuardBaseline | null => {
  if (!existsSync(guardBaselinePath)) {
    fail(
      'guard-regression',
      'Guard baseline is missing; regenerate it from the current trusted resolver surface',
      guardBaselinePath,
    )
    return null
  }

  return JSON.parse(readFileSync(guardBaselinePath, 'utf8')) as GuardBaseline
}

const getResolverGuardMap = (): GuardBaseline => {
  const resolverFiles = walkFiles('libs/api/custom/src/lib', path => path.endsWith('.resolver.ts'))
  const guardMap: GuardBaseline = {}

  for (const file of resolverFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    const classGuards = getClassGuardNames(source)
    const operations = getGraphqlOperationMethods(source)
    if (operations.length === 0) continue

    guardMap[file] = {}
    for (const operation of operations) {
      const methodGuards = getGuardNames(operation.decorators)
      const effectiveGuards = methodGuards.length > 0 ? methodGuards : classGuards
      guardMap[file][operation.name] = effectiveGuards
    }
  }

  return guardMap
}

const guardRank = (guards: string[]): number => {
  if (guards.includes('GqlAuthAdminGuard')) return 3
  if (guards.some(guard => guard.includes('Scoped') || guard.includes('Owner'))) return 2
  if (guards.includes('GqlAuthGuard')) return 1
  return 0
}

const formatGuardList = (guards: string[]): string =>
  guards.length > 0 ? guards.join(', ') : 'none'

const checkGuardRegressions = () => {
  const baseline = readGuardBaseline()
  if (!baseline) return

  const current = getResolverGuardMap()
  for (const [file, methods] of Object.entries(baseline)) {
    if (!existsSync(file)) continue

    for (const [method, expectedGuards] of Object.entries(methods)) {
      const actualGuards = current[file]?.[method]
      if (!actualGuards) continue

      if (guardRank(actualGuards) < guardRank(expectedGuards)) {
        fail(
          'guard-regression',
          `Resolver guard for ${method} was downgraded from ${formatGuardList(
            expectedGuards,
          )} to ${formatGuardList(actualGuards)}`,
          file,
        )
      }
    }
  }
}

const updateGuardBaseline = () => {
  mkdirSync(dirname(guardBaselinePath), { recursive: true })
  writeFileSync(guardBaselinePath, `${JSON.stringify(getResolverGuardMap(), null, 2)}\n`)
  try {
    execSync(`pnpm exec prettier --write ${guardBaselinePath}`, { stdio: 'ignore' })
  } catch {
    // Formatting is best effort; format:check will catch any remaining drift.
  }
}

const isGeneratedOrExternalCode = (path: string): boolean =>
  path.includes('/node_modules/') ||
  path.includes('/build/') ||
  path.includes('/dist/') ||
  path.includes('/coverage/') ||
  path.includes('libs/api/generated-crud/') ||
  path.includes('libs/api/prisma/src/lib/prisma-generated/') ||
  path.includes('libs/shared/sdk/src/generated/')

const checkUnsafeTypeScriptCasts = () => {
  const files = walkFiles(
    '.',
    path =>
      /\.(ts|tsx)$/.test(path) &&
      path !== 'scripts/doctor.ts' &&
      !path.endsWith('.spec.ts') &&
      !path.endsWith('.spec.tsx') &&
      !isGeneratedOrExternalCode(path),
  )

  const unsafePatterns = [
    { pattern: /\bas\s+any\b/g, message: 'Avoid as any in non-generated source' },
    { pattern: /\bas\s+unknown\s+as\b/g, message: 'Avoid double-casting through unknown' },
    { pattern: /@ts-ignore/g, message: 'Use typed code instead of @ts-ignore' },
  ]

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const { pattern, message } of unsafePatterns) {
      for (const match of getRegexMatches(pattern, source)) {
        review('typescript-safety', message, file, getLineNumber(source, match.index))
      }
    }
  }
}

const isSensitiveUpgradePath = (path: string): boolean =>
  /^libs\/api\/(core|custom|utils|integrations)\//.test(path) ||
  path.startsWith('apps/api/') ||
  path.startsWith('apps/web/app/routes/') ||
  path === 'apps/web/app/routes.tsx' ||
  path === schemaPath ||
  path.includes('/guards/') ||
  path.includes('/billing/') ||
  path.includes('/auth/') ||
  path.includes('/rbac/') ||
  path.includes('/admin/')

const checkUpgradeNoteImpactGate = () => {
  if (!isSourceTemplateRepository()) return

  const changedFiles = getChangedFiles()
  const changedSensitiveFiles = changedFiles.filter(isSensitiveUpgradePath)
  if (changedSensitiveFiles.length === 0) return

  const changedNotes = changedFiles.filter(
    path => path.startsWith(`${notesDir}/`) && path.endsWith('.yaml'),
  )
  if (changedNotes.length === 0) {
    fail(
      'upgrade-notes',
      'Sensitive template behavior changed without a new upgrade note or priority: ignore note',
      changedSensitiveFiles[0],
    )
  }
}

const hasContextScopeAnchor = (source: string): boolean =>
  /@CtxUser\s*\(\)|\buser\.(?:id|organizationId|currentOrganizationId)\b|currentUser|organizationScoped/i.test(
    source,
  )

const usesInputIdInPrismaWhere = (source: string): boolean =>
  /\b(?:userId|organizationId|teamId|roleId|memberId|inviteId|subscriptionId|tokenId)\b/.test(
    source,
  ) &&
  /\b(?:findFirst|findUnique|findMany|update|updateMany|delete|deleteMany|create)\s*\(/.test(source)

const checkResolverScopeAnchoring = () => {
  const resolverFiles = walkFiles('libs/api/custom/src/lib', path => path.endsWith('.resolver.ts'))

  for (const file of resolverFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const operation of getGraphqlOperationMethods(source)) {
      const operationSource = `${operation.decorators}\n${operation.body}`
      if (!/@Args\s*\(/.test(operationSource) || !usesInputIdInPrismaWhere(operationSource))
        continue
      if (hasContextScopeAnchor(operationSource)) continue

      review(
        'resolver-scope',
        `Review ${operation.name}: resolver uses caller-supplied IDs in data access without an obvious @CtxUser scope anchor`,
        file,
        operation.line,
      )
    }
  }
}

const isSensitiveMutationDomain = (file: string): boolean =>
  /\/(auth|admin|billing|organization|subscription|user|role|permission|invite)\//.test(file)

const hasAuditMarker = (source: string): boolean =>
  /\baudit(?:Log)?\b|recordAuditLog|SecurityEvent|securityEvent/i.test(source)

const hasSiblingServiceAuditMarker = (file: string): boolean => {
  const serviceFiles = directFiles(dirname(file), path => path.endsWith('.service.ts'))
  return serviceFiles.some(serviceFile =>
    hasAuditMarker(stripComments(readFileSync(serviceFile, 'utf8'))),
  )
}

const checkAuditCoverageHeuristic = () => {
  const resolverFiles = walkFiles('libs/api/custom/src/lib', path => path.endsWith('.resolver.ts'))

  for (const file of resolverFiles) {
    if (!isSensitiveMutationDomain(file)) continue

    const source = stripComments(readFileSync(file, 'utf8'))
    const siblingServiceHasAuditMarker = hasSiblingServiceAuditMarker(file)
    for (const operation of getGraphqlOperationMethods(source)) {
      if (!/@Mutation\b/.test(operation.decorators)) continue
      if (
        hasAuditMarker(operation.body) ||
        hasAuditMarker(source) ||
        siblingServiceHasAuditMarker
      ) {
        continue
      }

      review(
        'audit-coverage',
        `Review ${operation.name}: sensitive mutation has no obvious audit log call in its resolver file`,
        file,
        operation.line,
      )
    }
  }
}

const hasPrivilegeCeiling = (source: string): boolean =>
  /role|permission|privilege|superAdmin|isSuperAdmin|higher|equal|ceiling/i.test(source)

const checkEmulationPrivilegeCeiling = () => {
  const resolverFiles = walkFiles('libs/api/custom/src/lib', path => path.endsWith('.resolver.ts'))
  for (const file of resolverFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const operation of getGraphqlOperationMethods(source)) {
      const isEmulationMutation =
        /@Mutation\b/.test(operation.decorators) &&
        (/\b(emulat|impersonat)/i.test(operation.name) ||
          /\b\w+\.emulate\w*\s*\(/i.test(operation.body) ||
          /\b\w+\.impersonate\w*\s*\(/i.test(operation.body))
      if (!isEmulationMutation) continue

      if (!operation.decorators.includes('GqlAuthAdminGuard')) {
        fail(
          'emulation-security',
          `Emulation/impersonation resolver ${operation.name} must require GqlAuthAdminGuard`,
          file,
        )
      }
    }
  }

  const serviceFiles = walkFiles(
    'libs/api/custom/src/lib',
    path => path.endsWith('.service.ts') && !path.endsWith('.spec.ts'),
  )

  for (const file of serviceFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    if (!/\b(emulat|impersonat)/i.test(source)) continue
    if (!hasPrivilegeCeiling(source)) {
      fail(
        'emulation-security',
        'Emulation/impersonation service code must enforce an explicit privilege ceiling',
        file,
      )
    }
  }
}

const printFindings = (label: string, items: Finding[]) => {
  if (items.length === 0) return

  console.log(`\n${label}`)
  for (const item of items) {
    let location = ''
    if (item.file) {
      location = relative(process.cwd(), item.file)
      if (item.line) {
        location = `${location}:${item.line}`
      }
    }
    const suffix = location ? ` (${location})` : ''
    console.log(`- [${item.check}] ${item.message}${suffix}`)
  }
}

if (shouldUpdateGuardBaseline) {
  updateGuardBaseline()
  console.log(`Updated ${guardBaselinePath}`)
  process.exit(0)
}

checkRoutes()
checkForbiddenPrismaImports()
checkStaleConfigNames()
checkMcpWiring()
checkApiControllerRoutesAllowed()
checkDefaultResolverGeneratedNameCollisions()
checkHandwrittenAdminSdkOperations()
checkPluginExportsAndRegistration()
checkIntegrationExports()
checkSkipCrudDocumentation()
checkPublishablePackageReadmes()
checkUpgradeNoteImpactGate()
checkGuardRegressions()
checkUnsafeTypeScriptCasts()
checkResolverScopeAnchoring()
checkAuditCoverageHeuristic()
checkEmulationPrivilegeCeiling()

printFindings('Warnings', warnings)
printFindings('Failures', failures)

if (failures.length > 0) {
  console.error(`\nNestled doctor failed with ${failures.length} issue(s).`)
  process.exit(1)
}

console.log('Nestled doctor passed.')
