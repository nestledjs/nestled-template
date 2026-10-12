// Typecheck every TypeScript config a project owns, and fail when any of them checks nothing.
//
// `tsc -p tsconfig.json` on a solution config (`files: []`, `include: []`, `references`) compiles
// zero files and exits 0, and a spec config that inherits the base `**/*.spec.ts` exclude does the
// same for every test. Both looked like passing typechecks. This runner resolves the configs a
// project owns, refuses any that resolve no files, and runs `tsc --noEmit` on each in turn.
//
// Usage: node scripts/typecheck-project.mjs <projectRoot> [tsconfig ...]
// With no tsconfig arguments, the project's own references from <projectRoot>/tsconfig.json are
// used (references into other projects are theirs to check), or tsconfig.json itself when it has
// none. Configs run one at a time so a project never holds more than one compiler in memory.

import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

// The workspace's own TypeScript first, then the one installed beside this script.
const resolveFrom = (workspaceRoot, request) =>
  require.resolve(request, { paths: [workspaceRoot, dirname(fileURLToPath(import.meta.url))] })

export function loadTypeScript(workspaceRoot) {
  return require(resolveFrom(workspaceRoot, 'typescript'))
}

function isInside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function referencePath(fromConfig, reference) {
  const target = resolve(dirname(fromConfig), reference)
  return existsSync(target) && statSync(target).isDirectory()
    ? join(target, 'tsconfig.json')
    : target
}

function formatDiagnostic(ts, diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
}

export function readConfig(ts, configPath) {
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error) {
    return { configPath, error: formatDiagnostic(ts, read.error), fileNames: [], references: [] }
  }
  // Parsing mutates the raw object (it gains the merged `exclude`), so keep the original first.
  const raw = structuredClone(read.config)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath))
  // TS18003 is "No inputs were found": reported below as a config that checks nothing.
  const errors = parsed.errors.filter(diagnostic => diagnostic.code !== 18003)
  return {
    configPath,
    error: errors.length > 0 ? errors.map(d => formatDiagnostic(ts, d)).join('\n') : undefined,
    fileNames: parsed.fileNames,
    inheritedExclusions: inheritedExclusions(ts, configPath, raw, parsed.fileNames),
    references: (raw.references ?? []).map(ref => referencePath(configPath, ref.path)),
  }
}

// Files this config's own `include` asks for that only an `exclude` inherited through `extends`
// removes. The workspace base excludes `**/*.spec.ts`, so a spec config without its own `exclude`
// silently drops every spec while still matching `vite.config.ts` — a non-zero file count that
// checks no test.
function inheritedExclusions(ts, configPath, rawConfig, fileNames) {
  if (rawConfig.exclude !== undefined || rawConfig.include === undefined || !rawConfig.extends) {
    return []
  }
  const unexcluded = ts.parseJsonConfigFileContent(
    { ...rawConfig, exclude: ['**/node_modules'] },
    ts.sys,
    dirname(configPath),
  )
  const kept = new Set(fileNames)
  return unexcluded.fileNames.filter(fileName => !kept.has(fileName))
}

export function resolveProjectConfigs(ts, projectRoot, explicitConfigs = []) {
  if (explicitConfigs.length > 0) {
    return explicitConfigs.map(config => resolve(projectRoot, config))
  }
  const solution = join(projectRoot, 'tsconfig.json')
  if (!existsSync(solution)) {
    throw new Error(`${solution} does not exist`)
  }
  const { references } = readConfig(ts, solution)
  const owned = references.filter(config => isInside(projectRoot, dirname(config)))
  return owned.length > 0 ? owned : [solution]
}

export function inspectConfigs(ts, configPaths) {
  return configPaths.map(configPath => {
    if (!existsSync(configPath)) {
      return { configPath, problem: 'does not exist' }
    }
    const config = readConfig(ts, configPath)
    if (config.error) {
      return { configPath, problem: config.error }
    }
    if (config.inheritedExclusions.length > 0) {
      const examples = config.inheritedExclusions
        .slice(0, 3)
        .map(file => relative(dirname(configPath), file))
      return {
        configPath,
        problem:
          `an exclude inherited through "extends" removes ${config.inheritedExclusions.length} ` +
          `file(s) its own include asks for (${examples.join(', ')}). Declare "exclude" in this config.`,
      }
    }
    if (config.fileNames.length === 0) {
      return { configPath, problem: 'matches no files, so it checks nothing' }
    }
    return { configPath, fileCount: config.fileNames.length, fileNames: config.fileNames }
  })
}

// Tracked TypeScript sources under the project that none of its checked configs compile. A test
// folder no config includes (apps/web/tests) is otherwise invisible to every typecheck.
export function uncoveredFiles(workspaceRoot, projectRoot, inspected) {
  const listed = spawnSync('git', ['ls-files', '-z', '--', relative(workspaceRoot, projectRoot)], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  })
  if (listed.status !== 0) {
    throw new Error(`git ls-files failed: ${listed.stderr || listed.error?.message}`)
  }
  const covered = new Set(inspected.flatMap(config => config.fileNames ?? []).map(f => resolve(f)))
  // A nested project checks its own files only when the typecheck plugin gives it a target: a root
  // with both project.json and tsconfig.json. Either file alone gets no target, so its files would
  // otherwise be checked nowhere.
  const files = listed.stdout.split('\0').filter(Boolean)
  const tracked = new Set(files)
  const nestedProjects = new Set()
  for (const file of files) {
    const directory = dirname(resolve(workspaceRoot, file))
    const sibling = join(dirname(file), 'tsconfig.json').split(sep).join('/')
    if (file.endsWith('/project.json') && directory !== projectRoot && tracked.has(sibling)) {
      nestedProjects.add(directory)
    }
  }
  return files
    .map(file => resolve(workspaceRoot, file))
    .filter(file => /\.[cm]?tsx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file))
    .filter(file => !covered.has(file))
    .filter(file => ![...nestedProjects].some(nested => isInside(nested, file)))
}

function runTsc(workspaceRoot, configPath) {
  const tsc = resolveFrom(workspaceRoot, 'typescript/bin/tsc')
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', configPath], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(result.error.message)
    return 1
  }
  return result.status ?? 1
}

export function main(argv, workspaceRoot = process.cwd()) {
  const [projectArgument, ...explicitConfigs] = argv
  if (!projectArgument) {
    console.error('Usage: node scripts/typecheck-project.mjs <projectRoot> [tsconfig ...]')
    return 2
  }
  const ts = loadTypeScript(workspaceRoot)
  const projectRoot = resolve(workspaceRoot, projectArgument)
  const configs = resolveProjectConfigs(ts, projectRoot, explicitConfigs)
  const inspected = inspectConfigs(ts, configs)
  const display = path => relative(workspaceRoot, path).split(sep).join('/')

  const broken = inspected.filter(config => config.problem)
  for (const config of broken) {
    console.error(`✖ ${display(config.configPath)}: ${config.problem}`)
  }
  if (broken.length > 0) {
    return 1
  }
  const uncovered = uncoveredFiles(workspaceRoot, projectRoot, inspected)
  if (uncovered.length > 0) {
    console.error(
      `✖ ${uncovered.length} TypeScript file(s) in ${display(projectRoot)} are in no checked config:`,
    )
    for (const file of uncovered) {
      console.error(`    ${display(file)}`)
    }
    console.error('  Add them to the tsconfig that matches how they run (app, lib or spec).')
    return 1
  }

  let failed = 0
  for (const config of inspected) {
    console.log(`→ ${display(config.configPath)} (${config.fileCount} files)`)
    if (runTsc(workspaceRoot, config.configPath) !== 0) {
      failed += 1
    }
  }
  return failed > 0 ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2))
}
