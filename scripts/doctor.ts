import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import {
  declaresAuthLevel,
  getAuthOperations,
  getGuardRank,
  getOperationGuardNames,
  hasAuthenticationGuard,
} from './doctor-auth-analysis'
import {
  analyzeAccessPolicies,
  readStringObjectArray,
  type AccessPolicyDeclaration,
  type InlineAccessCheckViolation,
} from './doctor-access-policy-analysis'
import {
  getCrudAuthAnnotationLines,
  getCustomResolverNameViolations,
  getGeneratedCrudImportViolations,
  getGraphqlRootFieldNames,
  getLegacyCoreHelpersImportViolations,
  getNonAdminOperationViolations,
  getPublicSdkGeneratedCrudViolations,
  isHandwrittenApiFile,
  supportsAdminOnlyGeneratorBoundary,
} from './doctor-crud-boundary-analysis'
import {
  getSdkContractReport,
  normalizeContractPath,
  type GraphqlSource,
  type SdkContractReport,
  type TypeScriptSource,
} from './doctor-sdk-contract-analysis'
import { getRegisteredModuleClasses } from './doctor-module-analysis'
import { stripComments } from './doctor-source-analysis'

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
const generatorPackagePath = 'node_modules/@nestledjs/generators/package.json'
const notesDir = '.nestled-updates/upgrade-notes'
const guardBaselinePath = '.nestled-updates/security/guard-baseline.json'
const publicOperationsPath = '.nestled-updates/security/public-operations.json'
const platformPermissionCatalogPath =
  'libs/api/prisma/src/lib/seed/seed-data/seed-platform-access-control.ts'
const organizationPermissionCatalogPath =
  'libs/api/prisma/src/lib/seed/seed-data/seed-roles-permissions.ts'
const sdkContractBaselinePath = '.nestled-updates/sdk-contract-baseline.json'
const sdkContractExceptionsPath = '.nestled-updates/sdk-contract-exceptions.json'
const resolverSourceRoots = ['libs/api', 'apps/api/src']
const gitBaseRef = process.env.NX_BASE || process.env.GITHUB_BASE_REF || 'develop'
const shouldUpdateGuardBaseline = process.argv.includes('--update-guard-baseline')
const shouldUpdateSdkContractBaseline = process.argv.includes('--update-sdk-contract-baseline')
const sourceTemplateRemotePattern = /github\.com[:/]nestledjs\/nestled-(?:dev-)?template(?:\.git)?$/

type GuardBaseline = Record<string, Record<string, string[]>>

// file -> operation name -> reason the operation is intentionally reachable without a guard.
type PublicOperationAllowlist = Record<string, Record<string, string>>

type SdkContractBaseline = {
  apiWithoutSdk?: string[]
  inlineClientOperations?: string[]
}

type SdkContractExceptions = {
  apiWithoutSdk?: Record<string, string>
  inlineClientOperations?: Record<string, string>
  sdkWithoutConsumer?: Record<string, string>
}

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
    'git ls-files --others --exclude-standard',
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

const safeReadDir = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const safeStat = (path: string) => {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}

const walkFiles = (dir: string, predicate: (path: string) => boolean): string[] => {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of safeReadDir(dir)) {
    const path = join(dir, entry)
    const stat = safeStat(path)
    if (!stat) continue

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

  return safeReadDir(dir)
    .map(entry => join(dir, entry))
    .filter(path => safeStat(path)?.isFile() === true && predicate(path))
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

// Resolve a relative import spec to a file on disk (adding .ts/.tsx or an index file).
const resolveLocalImport = (fromDir: string, spec: string): string | undefined => {
  const base = join(fromDir, spec)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  return candidates.find(candidate => safeStat(candidate)?.isFile() === true)
}

const getRegisteredRouteFiles = (): Set<string> => {
  if (!existsSync(routeConfigPath)) {
    fail('routes', 'Route configuration file is missing', routeConfigPath)
    return new Set()
  }

  // Route file paths (`route('x', './routes/x.tsx')`) resolve from the app root, so a helper that
  // composes routes (createAdminRoutes() etc.) uses the same `./routes/...` strings from a different
  // file. Scan routes.tsx AND every file it imports transitively (relative imports only), or
  // helper-composed routes report as unregistered (fleet-upstream #121).
  const registered = new Set<string>()
  const routeFilePattern = /['"]\.\/routes\/([^'"]+\.(?:tsx|ts))['"]/g
  const importPattern = /from\s+['"](\.[^'"]+)['"]/g
  const visited = new Set<string>()

  // Template-literal route paths: helpers build a family of routes from a shared prefix —
  // route('overview', `./routes/${basePath}/overview.tsx`) — which the quoted-string pattern
  // cannot see, so helper-composed routes read as unregistered even after the transitive scan
  // (fleet-upstream #135). Substituting simple string constants declared in the SAME file
  // resolves them to concrete paths. Concrete matters: `registered` is also used to check each
  // entry EXISTS, so a wildcard would satisfy the is-it-registered check while silently
  // disabling the does-it-exist one. Anything still carrying an unresolved `${…}` is skipped,
  // not guessed at.
  const templatePattern = /`\.\/routes\/([^`]+\.(?:tsx|ts))`/g
  // The literal must be the WHOLE initializer (allowing a trailing `as const`): matching the
  // prefix of `const basePath = 'foo' + suffix` would substitute 'foo' as if it were the full
  // value and register a wrong concrete path. Only horizontal whitespace before the terminator,
  // so the lookahead can see the newline that ends the declaration.
  const constantPattern =
    /\b(?:const|let|var)\s+(\w+)\s*=\s*['"]([^'"]+)['"][^\S\n]*(?=as\b|;|\n|$)/g

  const scan = (filePath: string): void => {
    if (visited.has(filePath) || !existsSync(filePath)) return
    visited.add(filePath)
    const source = stripComments(readFileSync(filePath, 'utf8'))
    for (const match of getRegexMatches(routeFilePattern, source)) {
      registered.add(join(routeRoot, match[1]))
    }

    const constants = new Map<string, string>()
    for (const match of getRegexMatches(constantPattern, source)) {
      constants.set(match[1], match[2])
    }
    for (const match of getRegexMatches(templatePattern, source)) {
      const resolved = match[1].replace(
        /\$\{(\w+)\}/g,
        (whole, name: string) => constants.get(name) ?? whole,
      )
      if (!resolved.includes('${')) registered.add(join(routeRoot, resolved))
    }

    for (const match of getRegexMatches(importPattern, source)) {
      const resolved = resolveLocalImport(dirname(filePath), match[1])
      if (resolved) scan(resolved)
    }
  }
  scan(routeConfigPath)

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
        "Import Prisma types from the workspace's API Prisma wrapper instead of @prisma/client",
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
      // Skip dev-authoring docs (plans/, agents/, ai-docs/): not the product surface, and they
      // routinely quote the stale/buggy config key by name while documenting the very fix.
      !path.startsWith('plans/') &&
      !path.startsWith('agents/') &&
      !path.startsWith('ai-docs/') &&
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

const controllerSourceRoots = ['apps/api', 'libs/api']

const getControllerSourceFiles = (): string[] => {
  const files = controllerSourceRoots.flatMap(root =>
    walkFiles(root, path => isControllerCandidateFile(path) && path.endsWith('.controller.ts')),
  )
  return [...new Set(files)].sort((left, right) => left.localeCompare(right))
}

const getAuthSourceFiles = (): string[] => {
  const files = resolverSourceRoots.flatMap(root =>
    walkFiles(root, path => path.endsWith('.resolver.ts') && !path.endsWith('.spec.ts')),
  )
  return [...new Set([...files, ...getControllerSourceFiles()])].sort((left, right) =>
    left.localeCompare(right),
  )
}

const getGuardBaselineSourceFiles = (): string[] => {
  const customResolverFiles = walkFiles('libs/api/custom/src/lib', path =>
    path.endsWith('.resolver.ts'),
  )
  return [...new Set([...customResolverFiles, ...getControllerSourceFiles()])].sort((left, right) =>
    left.localeCompare(right),
  )
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
      if (/@(?:Query|Mutation|Subscription|ResolveField)\b/.test(decorators)) {
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

const checkDefaultResolverComposition = (file: string, source: string) => {
  if (!/\bextends\s+Generated\w+Resolver\b/.test(source)) return

  fail(
    'api-names',
    'Custom model resolvers must be additive and must not extend generated CRUD resolvers',
    file,
  )
}

const checkDefaultResolverFile = (file: string, generatedMethodNames: Set<string>) => {
  const source = readFileSync(file, 'utf8')
  checkDefaultResolverComposition(file, stripComments(source))

  for (const violation of getCustomResolverNameViolations(source, generatedMethodNames, file)) {
    fail('api-names', violation.message, file, violation.line)
  }
}

const getGeneratedResolverClassNames = (): string[] => {
  const resolverFiles = walkFiles('libs/api/generated-crud/feature/src/lib', path =>
    path.endsWith('.resolver.ts'),
  )
  const classNames: string[] = []

  for (const file of resolverFiles) {
    const source = stripComments(readFileSync(file, 'utf8'))
    const classMatch = /export\s+class\s+(Generated\w+Resolver)\b/.exec(source)
    if (classMatch) classNames.push(classMatch[1])
  }

  return classNames.sort((left, right) => left.localeCompare(right))
}

const checkGeneratedCrudModuleRegistration = () => {
  const featureRoot = 'libs/api/generated-crud/feature/src'
  const canonicalModulePath = join(featureRoot, 'lib/api-generated-crud-feature.module.ts')
  const featureIndexPath = join(featureRoot, 'index.ts')
  const appModulePath = 'apps/api/src/app.module.ts'
  const moduleFiles = walkFiles(join(featureRoot, 'lib'), path => path.endsWith('.module.ts'))
  const moduleDeclarations = moduleFiles.filter(file =>
    readFileSync(file, 'utf8').includes('export class ApiGeneratedCrudFeatureModule'),
  )

  if (moduleDeclarations.length !== 1 || moduleDeclarations[0] !== canonicalModulePath) {
    fail(
      'crud-registration',
      'Generated CRUD must declare exactly one ApiGeneratedCrudFeatureModule at the canonical path',
      canonicalModulePath,
    )
    return
  }

  const moduleSource = stripComments(readFileSync(canonicalModulePath, 'utf8'))
  const providerBlock = /providers\s*:\s*\[([\s\S]*?)\]/.exec(moduleSource)?.[1] ?? ''
  const registeredProviders = new Set(
    getRegexMatches(/\bGenerated\w+Resolver\b/g, providerBlock).map(match => match[0]),
  )
  const resolverClasses = getGeneratedResolverClassNames()

  for (const resolverClass of resolverClasses) {
    if (!registeredProviders.has(resolverClass)) {
      fail(
        'crud-registration',
        `Generated resolver provider "${resolverClass}" is missing from ApiGeneratedCrudFeatureModule`,
        canonicalModulePath,
      )
    }
  }
  if (registeredProviders.size !== resolverClasses.length) {
    fail(
      'crud-registration',
      'Generated CRUD provider count does not match the generated resolver files',
      canonicalModulePath,
    )
  }

  if (!existsSync(featureIndexPath)) {
    fail('crud-registration', 'Generated CRUD feature barrel is missing', featureIndexPath)
  } else {
    const indexSource = stripComments(readFileSync(featureIndexPath, 'utf8'))
    if (!indexSource.includes("'./lib/api-generated-crud-feature.module'")) {
      fail(
        'crud-registration',
        'Generated CRUD feature barrel must export the canonical feature module',
        featureIndexPath,
      )
    }
  }

  if (!existsSync(appModulePath)) {
    fail('crud-registration', 'API app module is missing', appModulePath)
    return
  }
  const appModuleSource = stripComments(readFileSync(appModulePath, 'utf8'))
  const hasFeatureImport =
    /import\s*\{\s*ApiGeneratedCrudFeatureModule\s*\}\s*from\s*['"]@[^'"]+\/api\/generated-crud\/feature['"]/.test(
      appModuleSource,
    )
  // Scanned rather than matched with a regex: two lazy [\s\S]*? either side of the module name
  // backtracks super-linearly on any file that declares coreModules without registering it, which
  // is exactly the failing case this check exists to report.
  const hasFeatureRegistration = (() => {
    const declaration = appModuleSource.indexOf('coreModules')
    if (declaration === -1) return false
    const open = appModuleSource.indexOf('[', declaration)
    if (open === -1) return false
    const close = appModuleSource.indexOf(']', open)
    if (close === -1) return false
    return /\bApiGeneratedCrudFeatureModule\b/.test(appModuleSource.slice(open + 1, close))
  })()
  if (!hasFeatureImport || !hasFeatureRegistration) {
    fail(
      'crud-registration',
      'ApiGeneratedCrudFeatureModule must be imported and registered in coreModules',
      appModulePath,
    )
  }
}

const checkGeneratedCrudAlwaysAdmin = () => {
  const resolverFiles = walkFiles('libs/api/generated-crud/feature/src/lib', path =>
    path.endsWith('.resolver.ts'),
  )

  for (const file of resolverFiles) {
    const source = readFileSync(file, 'utf8')
    for (const violation of getNonAdminOperationViolations(source, file)) {
      fail(
        'admin-crud-boundary',
        `Generated CRUD is fixed admin-only: ${violation.message}`,
        file,
        violation.line,
      )
    }
  }
}

const checkCrudAuthAnnotations = () => {
  if (!existsSync(schemaPath)) return

  const schema = readFileSync(schemaPath, 'utf8')
  for (const line of getCrudAuthAnnotationLines(schema)) {
    fail(
      'admin-crud-boundary',
      '@crudAuth is no longer supported: generated CRUD is always admin-only; create an explicit custom resolver and input for user-facing access',
      schemaPath,
      line,
    )
  }
}

const checkGeneratorAdminBoundaryVersion = () => {
  if (!existsSync(generatorPackagePath)) {
    fail(
      'admin-crud-boundary',
      '@nestledjs/generators is not installed; run pnpm install with version 3.0.3 or newer',
      generatorPackagePath,
    )
    return
  }

  const packageJson = JSON.parse(readFileSync(generatorPackagePath, 'utf8')) as {
    version?: unknown
  }
  const version = typeof packageJson.version === 'string' ? packageJson.version : ''
  if (!supportsAdminOnlyGeneratorBoundary(version)) {
    fail(
      'admin-crud-boundary',
      `@nestledjs/generators ${version || '(unknown version)'} cannot enforce the permanent admin-only CRUD and application-owned SDK boundary; upgrade to 3.0.3 or newer before running db-update`,
      generatorPackagePath,
    )
  }
}

const checkHandwrittenCrudImports = () => {
  const handwrittenApiFiles = [
    ...walkFiles('libs/api', isHandwrittenApiFile),
    ...walkFiles('apps/api/src', isHandwrittenApiFile),
  ]

  for (const file of handwrittenApiFiles) {
    const source = readFileSync(file, 'utf8')
    const violations = [
      ...getGeneratedCrudImportViolations(source, file),
      ...getLegacyCoreHelpersImportViolations(source, file),
    ]

    for (const violation of violations) {
      fail('admin-crud-boundary', violation.message, file, violation.line)
    }
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

const checkApplicationSdkCrudBoundary = () => {
  const generatedRootFields = new Set<string>()
  const adminFiles = walkFiles('libs/shared/sdk/src/__admin', path => path.endsWith('.graphql'))

  for (const file of adminFiles) {
    const source = readFileSync(file, 'utf8')
    for (const fieldName of getGraphqlRootFieldNames(source)) generatedRootFields.add(fieldName)
  }

  const applicationFiles = walkFiles('libs/shared/sdk/src/graphql', path =>
    path.endsWith('.graphql'),
  )
  const applicationDocuments = applicationFiles.map(file => ({
    file,
    source: readFileSync(file, 'utf8'),
  }))
  const applicationSources = applicationDocuments.map(document => document.source)

  for (const document of applicationDocuments) {
    for (const violation of getPublicSdkGeneratedCrudViolations(
      document.source,
      generatedRootFields,
      applicationSources,
    )) {
      fail('admin-crud-boundary', violation.message, document.file, violation.line)
    }
  }
}

const readSdkContractBaseline = (): SdkContractBaseline => {
  if (!existsSync(sdkContractBaselinePath)) return {}
  return JSON.parse(readFileSync(sdkContractBaselinePath, 'utf8')) as SdkContractBaseline
}

const readSdkContractExceptions = (): SdkContractExceptions => {
  if (!existsSync(sdkContractExceptionsPath)) return {}
  return JSON.parse(readFileSync(sdkContractExceptionsPath, 'utf8')) as SdkContractExceptions
}

const writeSdkContractBaseline = (
  report: ReturnType<typeof getSdkContractReport>,
  exceptions: SdkContractExceptions,
): SdkContractBaseline => {
  const baseline: SdkContractBaseline = {
    apiWithoutSdk: report.apiWithoutSdk.filter(field => !exceptions.apiWithoutSdk?.[field]),
    inlineClientOperations: report.inlineClientOperations
      .map(operation => `${operation.file}#${operation.name}`)
      .filter(operation => !exceptions.inlineClientOperations?.[operation]),
  }
  mkdirSync(dirname(sdkContractBaselinePath), { recursive: true })
  writeFileSync(sdkContractBaselinePath, `${JSON.stringify(baseline, null, 2)}\n`)
  return baseline
}

const graphqlSourcesUnder = (root: string): GraphqlSource[] =>
  walkFiles(root, path => path.endsWith('.graphql')).map(file => ({
    file: normalizeContractPath(file),
    source: readFileSync(file, 'utf8'),
  }))

const isClientContractSource = (path: string): boolean => {
  const contractPath = normalizeContractPath(path)
  return (
    (contractPath.endsWith('.ts') || contractPath.endsWith('.tsx')) &&
    !contractPath.startsWith('apps/api/') &&
    !contractPath.startsWith('libs/api/') &&
    !contractPath.startsWith('libs/shared/sdk/') &&
    !contractPath.endsWith('.spec.ts') &&
    !contractPath.endsWith('.spec.tsx') &&
    !contractPath.endsWith('.test.ts') &&
    !contractPath.endsWith('.test.tsx')
  )
}

const clientContractSources = (): TypeScriptSource[] =>
  ['apps', 'libs'].flatMap(root =>
    walkFiles(root, isClientContractSource).map(file => ({
      file: normalizeContractPath(file),
      source: readFileSync(file, 'utf8'),
    })),
  )

const reportSdkWithoutApi = (report: SdkContractReport): void => {
  for (const mismatch of report.sdkWithoutApi) {
    fail(
      'sdk-contract',
      `SDK operation ${mismatch.operation} references missing GraphQL root field(s): ` +
        mismatch.rootFields.join(', '),
      mismatch.file,
    )
  }
}

const reportApiWithoutSdk = (
  report: SdkContractReport,
  exceptions: SdkContractExceptions,
  baselineApiFields: ReadonlySet<string>,
): void => {
  for (const field of report.apiWithoutSdk) {
    if (exceptions.apiWithoutSdk?.[field]) continue
    const message =
      `GraphQL root field ${field} has no SDK operation document; add one under ` +
      'libs/shared/sdk/src/graphql or document an external/internal/deprecated exception'
    if (baselineApiFields.has(field)) warn('sdk-contract', `Existing drift: ${message}`)
    else fail('sdk-contract', message, 'api-schema.graphql')
  }
}

const reportInlineClientOperations = (
  report: SdkContractReport,
  exceptions: SdkContractExceptions,
  baselineInlineOperations: ReadonlySet<string>,
): void => {
  for (const operation of report.inlineClientOperations) {
    const key = `${operation.file}#${operation.name}`
    if (exceptions.inlineClientOperations?.[key]) continue
    const message =
      `Client operation ${operation.name} bypasses the application SDK; move it to ` +
      'libs/shared/sdk/src/graphql and regenerate the SDK'
    if (baselineInlineOperations.has(key)) {
      warn('sdk-contract', `Existing drift: ${message}`, operation.file, operation.line)
    } else {
      fail('sdk-contract', message, operation.file, operation.line)
    }
  }
}

const reportResolvedSdkBaselineEntries = (
  report: SdkContractReport,
  baselineApiFields: ReadonlySet<string>,
  baselineInlineOperations: ReadonlySet<string>,
): void => {
  const currentApiFields = new Set(report.apiWithoutSdk)
  for (const field of baselineApiFields) {
    if (!currentApiFields.has(field)) {
      warn('sdk-contract', `Remove resolved API-without-SDK baseline entry: ${field}`)
    }
  }

  const currentInlineOperations = new Set(
    report.inlineClientOperations.map(operation => `${operation.file}#${operation.name}`),
  )
  for (const operation of baselineInlineOperations) {
    if (!currentInlineOperations.has(operation)) {
      warn('sdk-contract', `Remove resolved inline-operation baseline entry: ${operation}`)
    }
  }
}

const unusedSdkOperationsByFile = (
  report: SdkContractReport,
  exceptions: SdkContractExceptions,
): Map<string, string[]> => {
  const unusedByFile = new Map<string, string[]>()
  for (const operation of report.sdkWithoutConsumer) {
    const key = `${operation.file}#${operation.name}`
    if (exceptions.sdkWithoutConsumer?.[key]) continue
    const names = unusedByFile.get(operation.file) ?? []
    names.push(operation.name)
    unusedByFile.set(operation.file, names)
  }
  return unusedByFile
}

const operationNameCompare = (left: string, right: string): number => left.localeCompare(right)

const reportUnusedSdkOperations = (
  report: SdkContractReport,
  exceptions: SdkContractExceptions,
): void => {
  for (const [file, operationNames] of unusedSdkOperationsByFile(report, exceptions)) {
    operationNames.sort(operationNameCompare)
    warn(
      'sdk-contract',
      `SDK operations have no in-repo value consumer: ${operationNames.join(', ')}; ` +
        'remove them, document an external consumer, or begin API deprecation',
      file,
    )
  }
}

const checkSdkContract = () => {
  if (!existsSync('api-schema.graphql')) return

  const report = getSdkContractReport({
    adminSources: graphqlSourcesUnder('libs/shared/sdk/src/__admin'),
    applicationSources: graphqlSourcesUnder('libs/shared/sdk/src/graphql'),
    clientSources: clientContractSources(),
    schemaSource: readFileSync('api-schema.graphql', 'utf8'),
  })
  const exceptions = readSdkContractExceptions()
  const baseline = shouldUpdateSdkContractBaseline
    ? writeSdkContractBaseline(report, exceptions)
    : readSdkContractBaseline()
  const baselineApiFields = new Set(baseline.apiWithoutSdk ?? [])
  const baselineInlineOperations = new Set(baseline.inlineClientOperations ?? [])

  reportSdkWithoutApi(report)
  reportApiWithoutSdk(report, exceptions, baselineApiFields)
  reportInlineClientOperations(report, exceptions, baselineInlineOperations)
  reportResolvedSdkBaselineEntries(report, baselineApiFields, baselineInlineOperations)
  reportUnusedSdkOperations(report, exceptions)
}

const getModuleClasses = (source: string): string[] =>
  getRegexMatches(/export\s+class\s+(\w+Module)\b/g, source).map(match => match[1])

const isExportedFromIndex = (source: string, path: string): boolean =>
  source.includes(`'./${path}'`) || source.includes(`"./${path}"`)

const validatePluginModuleFile = (
  moduleFile: string,
  pluginIndex: string,
  registeredModules: Set<string>,
) => {
  const moduleSource = readFileSync(moduleFile, 'utf8')
  const moduleBasename = basename(moduleFile, '.ts')

  if (!isExportedFromIndex(pluginIndex, moduleBasename)) {
    fail('plugin-structure', 'Plugin module is not exported from its index.ts', moduleFile)
  }

  for (const moduleClass of getModuleClasses(moduleSource)) {
    if (!registeredModules.has(moduleClass)) {
      fail(
        'plugin-structure',
        'Plugin module is not reachable from the API app module; import it there or from another registered module',
        moduleFile,
      )
    }
  }
}

const validatePluginDirectory = (
  entry: string,
  pluginsRoot: string,
  rootIndex: string,
  registeredModules: Set<string>,
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
    validatePluginModuleFile(moduleFile, pluginIndex, registeredModules)
  }
}

const checkPluginExportsAndRegistration = () => {
  const pluginsRoot = 'libs/api/custom/src/lib/plugins'
  if (!existsSync(pluginsRoot)) return

  const rootIndexPath = join(pluginsRoot, 'index.ts')
  const appModulePath = 'apps/api/src/app.module.ts'
  const rootIndex = existsSync(rootIndexPath) ? readFileSync(rootIndexPath, 'utf8') : ''
  const moduleSources = [
    ...walkFiles('libs/api', path => path.endsWith('.module.ts')),
    ...walkFiles('apps/api', path => path.endsWith('.module.ts')),
  ].map(file => ({ file, source: readFileSync(file, 'utf8') }))
  const registeredModules = getRegisteredModuleClasses(moduleSources, appModulePath)

  for (const entry of readdirSync(pluginsRoot)) {
    validatePluginDirectory(entry, pluginsRoot, rootIndex, registeredModules)
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

const checkPublishedPackageVersions = () => {
  // Only this repository publishes @nestledjs/data-browser and @nestledjs/shared-components;
  // downstream projects consume them from npm and must not run this check.
  if (!isSourceTemplateRepository()) return

  // A version bump lands in a PR but the npm publish happens after merge, so an
  // unpublished version is expected on pull_request runs and only a failure once
  // the bump has been pushed to develop.
  const enforce = process.env.GITHUB_EVENT_NAME === 'push'
  const packageFiles = walkFiles('libs', path => basename(path) === 'package.json')

  for (const file of packageFiles) {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
      name?: string
      version?: string
      publishConfig?: unknown
      private?: boolean
    }
    const isPublishable = !pkg.private && (pkg.publishConfig || pkg.name?.startsWith('@nestledjs/'))
    if (!isPublishable || !pkg.name || !pkg.version) continue

    const publishedVersion = getCommandOutput(`npm view "${pkg.name}@${pkg.version}" version`)
    if (publishedVersion === pkg.version) continue

    const packageOnRegistry = getCommandOutput(`npm view "${pkg.name}" name`)
    if (!packageOnRegistry) {
      review(
        'published-versions',
        `Could not verify ${pkg.name}@${pkg.version} on npm (registry unreachable or package never published)`,
        file,
      )
      continue
    }

    const message = `${pkg.name}@${pkg.version} is not published to npm; publish it (pnpm nx release publish -p <project>) or revert the version bump`
    if (enforce) {
      fail('published-versions', message, file)
    } else {
      review('published-versions', message, file)
    }
  }
}

const readGuardBaseline = (): GuardBaseline | null => {
  if (!existsSync(guardBaselinePath)) {
    fail(
      'guard-regression',
      'Guard baseline is missing; regenerate it from the current trusted API surface',
      guardBaselinePath,
    )
    return null
  }

  return JSON.parse(readFileSync(guardBaselinePath, 'utf8')) as GuardBaseline
}

const getApiGuardMap = (): GuardBaseline => {
  const guardMap: GuardBaseline = {}

  for (const file of getGuardBaselineSourceFiles()) {
    const source = stripComments(readFileSync(file, 'utf8'))
    const operations = getAuthOperations(source, file)
    if (operations.length === 0) continue

    guardMap[file] = {}
    for (const operation of operations) {
      guardMap[file][operation.name] = getOperationGuardNames(operation)
    }
  }

  return guardMap
}

const formatGuardList = (guards: string[]): string =>
  guards.length > 0 ? guards.join(', ') : 'none'

const checkGuardRegressions = () => {
  const baseline = readGuardBaseline()
  if (!baseline) return

  const current = getApiGuardMap()
  for (const [file, methods] of Object.entries(baseline)) {
    if (!existsSync(file)) continue

    for (const [method, expectedGuards] of Object.entries(methods)) {
      const actualGuards = current[file]?.[method]
      if (!actualGuards) continue

      if (getGuardRank(actualGuards) < getGuardRank(expectedGuards)) {
        fail(
          'guard-regression',
          `API operation guard for ${method} was downgraded from ${formatGuardList(
            expectedGuards,
          )} to ${formatGuardList(actualGuards)}`,
          file,
        )
      }
    }
  }
}

const readPublicOperationAllowlist = (): PublicOperationAllowlist => {
  if (!existsSync(publicOperationsPath)) {
    fail(
      'unguarded-operation',
      'Public operation allowlist is missing; every intentionally public root operation must be declared there',
      publicOperationsPath,
    )
    return {}
  }

  return JSON.parse(readFileSync(publicOperationsPath, 'utf8')) as PublicOperationAllowlist
}

const reportStalePublicOperations = (
  allowlist: PublicOperationAllowlist,
  unguarded: Set<string>,
) => {
  for (const [file, operations] of Object.entries(allowlist)) {
    for (const name of Object.keys(operations)) {
      if (unguarded.has(`${file}::${name}`)) continue
      warn(
        'unguarded-operation',
        `Allowlisted public operation ${name} is now guarded or no longer exists; remove the stale entry`,
        publicOperationsPath,
      )
    }
  }
}

// `checkGuardRegressions` only walks the baseline, so it can catch a guard being *downgraded* but
// never a brand-new operation that shipped with no guard at all. Check GraphQL resolvers and REST
// controllers together: every API operation must carry an auth guard or be allowlisted as public.
const checkUnguardedRootOperations = () => {
  const allowlist = readPublicOperationAllowlist()
  const unguarded = new Set<string>()

  for (const file of getAuthSourceFiles()) {
    const source = stripComments(readFileSync(file, 'utf8'))

    for (const operation of getAuthOperations(source, file)) {
      // Keep @ResolveField handlers in this check. Nest executes guards on field handlers, and the
      // parent root may be public or otherwise less restrictive than the field it exposes.
      if (hasAuthenticationGuard(operation)) continue

      unguarded.add(`${file}::${operation.name}`)
      if (allowlist[file]?.[operation.name]) continue

      fail(
        'unguarded-operation',
        `API operation ${operation.className}.${operation.name} has no auth guard and is reachable unauthenticated; add @UseGuards(...) or declare it in ${publicOperationsPath} with a reason`,
        file,
        operation.line,
      )
    }
  }

  reportStalePublicOperations(allowlist, unguarded)
}

const updateGuardBaseline = () => {
  mkdirSync(dirname(guardBaselinePath), { recursive: true })
  writeFileSync(guardBaselinePath, `${JSON.stringify(getApiGuardMap(), null, 2)}\n`)
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
      // scripts/ is one-off ops/maintenance tooling (also excluded from Sonar), not shipped product
      // code; the cast gate targets the product surface. Specs and skipped future specs likewise.
      !path.startsWith('scripts/') &&
      !path.endsWith('.spec.ts') &&
      !path.endsWith('.spec.tsx') &&
      !path.endsWith('.spec.future.ts') &&
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

// Generator output, not authored code. `db-update` runs the doctor, regenerates, then runs the
// doctor again — so the second run always sees these rewritten and would demand a note for a file
// nobody wrote. Nothing is lost by skipping them: the change that produced them is `schema.prisma`,
// which is gated on its own line below, so gating the generated mirror too makes one change demand
// two notes. Generated CRUD output (`libs/api/generated-crud/**`) already sits outside this gate
// for the same reason.
//
// Exact file paths, NOT a directory prefix: `models/` also holds hand-written files
// (`core-paging.model.ts`), and `api-core-models.module.ts` sits beside it — a prefix would
// silently ungate them. These three are what `nx g @nestledjs/generators:models` writes; if that
// generator's output ever changes, this list changes with it.
const generatedOutputPaths = new Set([
  'libs/api/core/models/src/lib/models/models.ts',
  'libs/api/core/models/src/lib/models/enums.ts',
  'libs/api/core/models/src/lib/models/index.ts',
])

const isGeneratedOutput = (path: string): boolean => generatedOutputPaths.has(path)

const isSensitiveUpgradePath = (path: string): boolean =>
  !isGeneratedOutput(path) &&
  (/^libs\/api\/(core|custom|utils|integrations)\//.test(path) ||
    path.startsWith('apps/api/') ||
    path.startsWith('apps/web/app/routes/') ||
    path === 'apps/web/app/routes.tsx' ||
    path === schemaPath ||
    path.includes('/guards/') ||
    path.includes('/billing/') ||
    path.includes('/auth/') ||
    path.includes('/rbac/') ||
    path.includes('/admin/'))

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

type GraphqlOperation = ReturnType<typeof getGraphqlOperationMethods>[number]

const isEmulationMutation = (operation: GraphqlOperation): boolean =>
  /@Mutation\b/.test(operation.decorators) &&
  (/\b(emulat|impersonat)/i.test(operation.name) ||
    /\b\w+\.emulate\w*\s*\(/i.test(operation.body) ||
    /\b\w+\.impersonate\w*\s*\(/i.test(operation.body))

const hasEmulationAuthorization = (operation: GraphqlOperation): boolean =>
  operation.decorators.includes('GqlAuthAdminGuard') ||
  (operation.decorators.includes('RequirePlatformPermission') &&
    operation.decorators.includes('platform.users.emulate'))

const checkEmulationResolverFile = (file: string) => {
  const source = stripComments(readFileSync(file, 'utf8'))
  for (const operation of getGraphqlOperationMethods(source)) {
    if (!isEmulationMutation(operation) || hasEmulationAuthorization(operation)) continue
    fail(
      'emulation-security',
      `Emulation/impersonation resolver ${operation.name} must require GqlAuthAdminGuard or platform.users.emulate`,
      file,
    )
  }
}

const checkEmulationServiceFile = (file: string) => {
  const source = stripComments(readFileSync(file, 'utf8'))
  if (!/\b(emulat|impersonat)/i.test(source) || hasPrivilegeCeiling(source)) return
  fail(
    'emulation-security',
    'Emulation/impersonation service code must enforce an explicit privilege ceiling',
    file,
  )
}

const checkEmulationPrivilegeCeiling = () => {
  walkFiles('libs/api/custom/src/lib', path => path.endsWith('.resolver.ts')).forEach(
    checkEmulationResolverFile,
  )
  walkFiles(
    'libs/api/custom/src/lib',
    path => path.endsWith('.service.ts') && !path.endsWith('.spec.ts'),
  ).forEach(checkEmulationServiceFile)
}

// Read one key out of an already-loaded `.env` body. Shared by every check that inspects local
// env pairings, so the quoting/comment rules stay in one place.
const readEnvValue = (env: string, key: string): string => {
  const line = env.split('\n').find(l => l.startsWith(`${key}=`))
  const raw = line ? line.slice(key.length + 1).trim() : ''
  // Quoted value: strip the surrounding quotes and keep it verbatim. Unquoted
  // value: drop a dotenv-style inline ` # comment` so the parsed value matches
  // what dotenv actually loads. (String ops, not regex — avoids backtracking.)
  const quote = raw[0]
  if ((quote === '"' || quote === "'") && raw.length >= 2 && raw.endsWith(quote)) {
    return raw.slice(1, -1)
  }
  const commentAt = raw.indexOf(' #')
  return (commentAt === -1 ? raw : raw.slice(0, commentAt)).trim()
}

const checkCookieDomainConfig = () => {
  if (!existsSync('.env')) return
  const env = readFileSync('.env', 'utf8')
  const read = (key: string) => readEnvValue(env, key)
  const apiDomain = read('API_COOKIE_DOMAIN')
  const webDomain = read('VITE_COOKIE_DOMAIN')
  const isLocal = (v: string) => !v || v === 'localhost' || v.startsWith('127.')
  // Cookie scope ignores a single leading dot and case, so `.example.com` and
  // `example.com` are equivalent — normalize before comparing to avoid false warnings.
  const sameDomain = (a: string, b: string) =>
    a.replace(/^\./, '').toLowerCase() === b.replace(/^\./, '').toLowerCase()
  if (!isLocal(apiDomain) && isLocal(webDomain)) {
    warn(
      'cookie-domain',
      `API_COOKIE_DOMAIN=${apiDomain} is domain-scoped but VITE_COOKIE_DOMAIN is unset/localhost; ` +
        `the web app cannot clear the session cookie (PIR-173 redirect-loop risk). ` +
        `Set VITE_COOKIE_DOMAIN to match.`,
      '.env',
    )
  } else if (!isLocal(apiDomain) && !isLocal(webDomain) && !sameDomain(apiDomain, webDomain)) {
    warn(
      'cookie-domain',
      `VITE_COOKIE_DOMAIN (${webDomain}) does not match API_COOKIE_DOMAIN (${apiDomain}).`,
      '.env',
    )
  }
}

// Local dev ports move in must-move-together pairs: a port var, and the URL that points at it.
// Moving only one half fails SILENTLY — the process starts clean and is broken only in the
// browser, or, worse, connects to another repo's database. Documentation alone does not catch a
// half-edited .env; this does. See the port block in .env.example.
//
// WARN ONLY, never fail: .env is developer-local, CI has none, and a deliberate local setup must
// never be able to break a build.
type EnvReader = (key: string) => string

const DEV_PORT_DEFAULTS: Record<string, string> = {
  PORT: '3000',
  WEB_PORT: '4200',
  POSTGRES_PORT: '5432',
  POSTGRES_TEST_PORT: '5433',
  REDIS_PORT: '6379',
  MAILHOG_SMTP_PORT: '1025',
}

// A URL with no explicit port still connects to a concrete one, and that is exactly where the
// nastiest case hides: `postgresql://prisma:prisma@localhost/prisma` alongside POSTGRES_PORT=5442
// silently reaches 5432 — a DIFFERENT repo's database. Treating "no port written down" as
// "unknown, skip it" left that unwarned, so resolve the scheme's implicit port instead.
const DEFAULT_SCHEME_PORTS: Record<string, string> = {
  'postgres:': '5432',
  'postgresql:': '5432',
  'redis:': '6379',
  'rediss:': '6380',
  'http:': '80',
  'https:': '443',
}

/**
 * A URL's effective host port: the explicit one, else the scheme's default. '' only when the value
 * is unparseable or its scheme has no known default — genuinely unknown, and not this check's
 * problem. (`new URL` also drops a port that equals the scheme default, so `http://host:80` and
 * `http://host` both resolve to 80 here.)
 */
const urlPort = (value: string): string => {
  try {
    const url = new URL(value)
    return url.port || DEFAULT_SCHEME_PORTS[url.protocol] || ''
  } catch {
    return ''
  }
}

/** The value of a port var only when it has actually moved off its default; '' otherwise. */
const movedDevPort = (read: EnvReader, key: string): string => {
  const value = read(key)
  return value.length > 0 && value !== DEV_PORT_DEFAULTS[key] ? value : ''
}

const warnPortMismatch = (options: {
  portKey: string
  port: string
  urlKey: string
  urlValue: string
  requireSet: boolean
  consequence: string
  fix: string
}) => {
  const { portKey, port, urlKey, urlValue, requireSet, consequence, fix } = options
  if (urlValue.length === 0) {
    if (requireSet) {
      warn(
        'dev-ports',
        `${portKey}=${port} but ${urlKey} is not set — ${consequence} ${fix}`,
        '.env',
      )
    }
    return
  }

  const actual = urlPort(urlValue)
  if (actual === '' || actual === port) return

  warn(
    'dev-ports',
    `${portKey}=${port} but ${urlKey} uses port ${actual} — ${consequence} ${fix}`,
    '.env',
  )
}

const checkApiPortPairing = (read: EnvReader) => {
  const port = movedDevPort(read, 'PORT')
  if (!port) return

  for (const urlKey of ['VITE_API_URL', 'API_URL']) {
    warnPortMismatch({
      portKey: 'PORT',
      port,
      urlKey,
      urlValue: read(urlKey),
      requireSet: true,
      consequence: 'the browser will call the old API port and every request 404s or hangs.',
      fix: `Set ${urlKey} to http://localhost:${port}.`,
    })
  }
}

const checkWebPortPairing = (read: EnvReader) => {
  const port = movedDevPort(read, 'WEB_PORT')
  if (!port) return

  const origins = read('ALLOWED_ORIGINS')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0)

  if (origins.length > 0 && !origins.some(origin => urlPort(origin) === port)) {
    warn(
      'dev-ports',
      `WEB_PORT=${port} but ALLOWED_ORIGINS does not include http://localhost:${port} — ` +
        `the API will reject every browser request with a CORS error. Add it to ALLOWED_ORIGINS.`,
      '.env',
    )
  }

  // An unset ALLOWED_ORIGINS is fine: the API derives the origin from WEB_URL, and failing that
  // from WEB_PORT. Only an explicit WEB_URL on the wrong port defeats that derivation.
  if (origins.length === 0) {
    warnPortMismatch({
      portKey: 'WEB_PORT',
      port,
      urlKey: 'WEB_URL',
      urlValue: read('WEB_URL'),
      requireSet: false,
      consequence:
        'ALLOWED_ORIGINS is empty, so CORS falls back to WEB_URL and the API will reject every ' +
        'browser request.',
      fix: `Set WEB_URL to http://localhost:${port}, or list the origin in ALLOWED_ORIGINS.`,
    })
  }

  warnPortMismatch({
    portKey: 'WEB_PORT',
    port,
    urlKey: 'SITE_URL',
    urlValue: read('SITE_URL'),
    requireSet: false,
    consequence:
      'links in verification, password-reset, and invite emails point at the old web port.',
    fix: `Set SITE_URL to http://localhost:${port}.`,
  })
}

const checkDatabasePortPairings = (read: EnvReader) => {
  const pgPort = movedDevPort(read, 'POSTGRES_PORT')
  if (pgPort) {
    for (const urlKey of ['DATABASE_URL', 'DIRECT_URL']) {
      warnPortMismatch({
        portKey: 'POSTGRES_PORT',
        port: pgPort,
        urlKey,
        urlValue: read(urlKey),
        // DIRECT_URL is optional locally; DATABASE_URL is not.
        requireSet: urlKey === 'DATABASE_URL',
        consequence:
          'this connects to whatever Postgres is on the old port, very likely a DIFFERENT ' +
          'repo database, with no error anywhere.',
        fix: `Point ${urlKey} at port ${pgPort}.`,
      })
    }
  }

  const testPort = movedDevPort(read, 'POSTGRES_TEST_PORT')
  if (!testPort) return
  warnPortMismatch({
    portKey: 'POSTGRES_TEST_PORT',
    port: testPort,
    urlKey: 'TEST_DATABASE_URL',
    urlValue: read('TEST_DATABASE_URL'),
    requireSet: true,
    consequence: 'pnpm test:e2e will run against the wrong database, or none at all.',
    fix: `Point TEST_DATABASE_URL at port ${testPort}.`,
  })
}

const checkServicePortPairings = (read: EnvReader) => {
  const redisPort = movedDevPort(read, 'REDIS_PORT')
  if (redisPort) {
    warnPortMismatch({
      portKey: 'REDIS_PORT',
      port: redisPort,
      urlKey: 'REDIS_URL',
      urlValue: read('REDIS_URL'),
      requireSet: false,
      consequence: 'the API will talk to whatever Redis is on the old port.',
      fix: `Point REDIS_URL at port ${redisPort}.`,
    })
  }

  const mailhogPort = movedDevPort(read, 'MAILHOG_SMTP_PORT')
  if (!mailhogPort) return

  const smtpHost = read('SMTP_HOST')
  const isLocalSmtp = !smtpHost || smtpHost === 'localhost' || smtpHost.startsWith('127.')
  const smtpPort = read('SMTP_PORT')
  if (!isLocalSmtp || !smtpPort || smtpPort === mailhogPort) return

  warn(
    'dev-ports',
    `MAILHOG_SMTP_PORT=${mailhogPort} but SMTP_PORT=${smtpPort} with a local SMTP_HOST — ` +
      `outbound dev mail will fail to connect. Set SMTP_PORT to ${mailhogPort}.`,
    '.env',
  )
}

const checkDevPortPairings = () => {
  if (!existsSync('.env')) return
  const env = readFileSync('.env', 'utf8')
  const read = (key: string) => readEnvValue(env, key)

  checkApiPortPairing(read)
  checkWebPortPairing(read)
  checkDatabasePortPairings(read)
  checkServicePortPairings(read)
}

// `GlobalAuthGuard` applies equally to GraphQL resolvers and REST controllers. Declaration is the
// only way through, so Doctor must inspect both surfaces or a controller can pass review and start
// returning 403 for every request at runtime. Generated CRUD is covered here too rather than
// exempted: a regeneration that drops a decorator should fail before deployment.
const checkAuthLevelDeclarations = () => {
  for (const file of getAuthSourceFiles()) {
    const source = stripComments(readFileSync(file, 'utf8'))

    for (const operation of getAuthOperations(source, file)) {
      // GlobalAuthGuard also evaluates @ResolveField handlers, so they need explicit intent even
      // though they are reached through a parent root operation.
      if (declaresAuthLevel(operation)) continue

      fail(
        'auth-level',
        `API operation ${operation.className}.${operation.name} does not declare an access level; add @Public(), @Authenticated(), @AdminOnly(), or a scoped permission decorator at the method or class level so intent is explicit`,
        file,
        operation.line,
      )
    }
  }
}

const readPermissionCatalogs = () => {
  const platform = new Set<string>()
  if (existsSync(platformPermissionCatalogPath)) {
    const source = readFileSync(platformPermissionCatalogPath, 'utf8')
    for (const entry of readStringObjectArray(source, 'platformPermissions', ['key'])) {
      platform.add(entry.key)
    }
  }
  const organization = new Set<string>()
  if (existsSync(organizationPermissionCatalogPath)) {
    const source = readFileSync(organizationPermissionCatalogPath, 'utf8')
    for (const entry of readStringObjectArray(source, 'defaultPermissions', [
      'subject',
      'action',
    ])) {
      organization.add(`${entry.subject}:${entry.action}`)
    }
  }
  return { organization, platform }
}

const reportAccessPolicyDeclaration = (
  declaration: AccessPolicyDeclaration,
  file: string,
  catalogs: ReturnType<typeof readPermissionCatalogs>,
  emptyScopesInUse: Set<string>,
): void => {
  if (declaration.permissions.length === 0) {
    fail(
      'access-policy',
      `${declaration.className}.${declaration.name} declares ${declaration.decorator} without a permission`,
      file,
      declaration.line,
    )
    return
  }

  const catalog = catalogs[declaration.scope]
  // An empty catalog would report EVERY declared permission as "unknown" — a broken read, not N real
  // findings (fleet-upstream #120). Note the scope once; the caller reports it after the sweep.
  if (catalog.size === 0) {
    emptyScopesInUse.add(declaration.scope)
    return
  }
  for (const permission of declaration.permissions) {
    if (catalog.has(permission)) continue
    fail(
      'access-policy',
      `${declaration.className}.${declaration.name} declares unknown ${declaration.scope} permission ${permission}; add it to the code-owned catalog or fix the typo`,
      file,
      declaration.line,
    )
  }
}

const reportInlineAccessViolation = (violation: InlineAccessCheckViolation, file: string): void => {
  fail(
    'access-policy',
    `${violation.className}.${violation.name} calls ${violation.calls.join(', ')} inside the operation body without a scoped permission decorator; move the role gate into declarative metadata and leave only row/object checks in the service`,
    file,
    violation.line,
  )
}

const checkAccessPolicyDeclarations = () => {
  const catalogs = readPermissionCatalogs()
  const emptyScopesInUse = new Set<string>()

  for (const file of getAuthSourceFiles()) {
    const report = analyzeAccessPolicies(readFileSync(file, 'utf8'), file)
    for (const declaration of report.declarations) {
      reportAccessPolicyDeclaration(declaration, file, catalogs, emptyScopesInUse)
    }
    for (const violation of report.inlineViolations) {
      reportInlineAccessViolation(violation, file)
    }
  }

  const scopeCatalogPath: Record<string, string> = {
    platform: platformPermissionCatalogPath,
    organization: organizationPermissionCatalogPath,
  }
  for (const scope of emptyScopesInUse) {
    fail(
      'access-policy',
      `The ${scope} permission catalog is empty or unreadable, so access-policy declarations using it cannot be validated (every permission would otherwise report "unknown"). Check the catalog seed file and the exported array the doctor reads.`,
      scopeCatalogPath[scope],
    )
  }
}

// A concurrent `prisma generate` — typically `db-update` running while a dev server triggers its
// own generate — can truncate the client to an empty file while still reporting success. Nx cannot
// see it: `api-prisma:generate` declares this directory as an output, but Nx hashes inputs, so an
// unchanged schema yields an unchanged cache key no matter what the generator actually wrote. The
// directory is also gitignored, so nothing else notices either.
//
// The resulting failure is three hops from its cause. `client.ts` re-exports this file, so every
// enum becomes undefined at runtime, `registerEnumType(undefined, ...)` stores an undefined ref, and
// the API dies during GraphQL schema build with "Cannot convert undefined or null to object" —
// naming neither Prisma nor this file.
const checkPrismaGeneratedEnums = () => {
  const generatedDir = 'libs/api/prisma/src/lib/prisma-generated'
  // Nothing generated yet is a legitimate state, e.g. a fresh clone before the first generate.
  if (!existsSync(generatedDir) || !existsSync(schemaPath)) return

  const declaredEnums = getRegexMatches(/^enum\s+(\w+)/gm, readFileSync(schemaPath, 'utf8')).map(
    match => match[1],
  )
  if (declaredEnums.length === 0) return

  const enumsPath = join(generatedDir, 'enums.ts')
  if (!existsSync(enumsPath)) {
    fail(
      'prisma-generated',
      `${schemaPath} declares ${declaredEnums.length} enum(s) but the generated enums file is missing; re-run pnpm prisma:generate`,
      enumsPath,
    )
    return
  }

  const source = readFileSync(enumsPath, 'utf8')
  const missing = declaredEnums.filter(name => !source.includes(`export const ${name} =`))
  if (missing.length === 0) return

  fail(
    'prisma-generated',
    `Generated Prisma enums are incomplete (missing ${missing.join(', ')}). The client was written truncated, so these are undefined at runtime and the API will fail during GraphQL schema build. Re-run pnpm prisma:generate, then rebuild with --skip-nx-cache because Nx will otherwise reuse the stale bundle`,
    enumsPath,
  )
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

const cleanDownstreamAgentsMd = () => {
  if (isSourceTemplateRepository()) return

  const agentsPath = 'AGENTS.md'
  if (!existsSync(agentsPath)) return

  const content = readFileSync(agentsPath, 'utf8')

  // Locate the section by string scanning rather than a regex — avoids backtracking on large files
  // and, unlike the previous `(?=\n\n## )` lookahead, correctly handles the case where "Downstream
  // Upgrade Notes" is the LAST section (no following `## ` header) by falling back to end-of-file.
  const marker = '\n\n## Downstream Upgrade Notes\n'
  const start = content.indexOf(marker)
  if (start === -1) return

  const nextHeader = content.indexOf('\n\n## ', start + marker.length)
  const end = nextHeader === -1 ? content.length : nextHeader
  // `marker` starts with the section's leading `\n\n`, so when the section is LAST the remainder
  // ends mid-text with no trailing newline. Re-add it — .editorconfig sets insert_final_newline.
  const removed = content.slice(0, start) + content.slice(end)
  const cleaned = removed.endsWith('\n') ? removed : `${removed}\n`
  writeFileSync(agentsPath, cleaned, 'utf8')

  // Leave the edit UNSTAGED and let the caller commit it. Auto-running `git add`/`git commit` here
  // is unsafe in CI, on a dirty tree, with no configured git identity, or with pre-commit hooks.
  console.log(
    'Removed template-only upgrade note section from AGENTS.md — review and commit the change.',
  )
}

if (shouldUpdateGuardBaseline) {
  updateGuardBaseline()
  console.log(`Updated ${guardBaselinePath}`)
  process.exit(0)
}

cleanDownstreamAgentsMd()
checkRoutes()
checkForbiddenPrismaImports()
checkStaleConfigNames()
checkMcpWiring()
checkApiControllerRoutesAllowed()
checkGeneratedCrudModuleRegistration()
checkGeneratedCrudAlwaysAdmin()
checkCrudAuthAnnotations()
checkGeneratorAdminBoundaryVersion()
checkHandwrittenCrudImports()
checkDefaultResolverGeneratedNameCollisions()
checkHandwrittenAdminSdkOperations()
checkApplicationSdkCrudBoundary()
checkSdkContract()
checkPluginExportsAndRegistration()
checkIntegrationExports()
checkSkipCrudDocumentation()
checkPublishablePackageReadmes()
checkPublishedPackageVersions()
checkUpgradeNoteImpactGate()
checkCookieDomainConfig()
checkDevPortPairings()
checkGuardRegressions()
checkUnguardedRootOperations()
checkAuthLevelDeclarations()
checkAccessPolicyDeclarations()
checkPrismaGeneratedEnums()
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
