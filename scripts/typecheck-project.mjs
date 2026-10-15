// Typecheck every TypeScript config a project owns, and fail when any of them checks nothing.
//
// `tsc -p tsconfig.json` on a solution config (`files: []`, `include: []`, `references`) compiles
// zero files and exits 0, and a spec config that inherits the base `**/*.spec.ts` exclude does the
// same for every test. Both looked like passing typechecks. This runner resolves the configs a
// project owns, refuses any that resolve no files, and runs `tsc --noEmit` on each in turn.
//
// Usage: node scripts/typecheck-project.mjs <projectRoot> [tsconfig ...]
//        node scripts/typecheck-project.mjs --workspace <folder> [folder ...]
// With no tsconfig arguments, the project's own references from <projectRoot>/tsconfig.json are
// used (references into other projects are theirs to check), or tsconfig.json itself when it has
// none. Configs run one at a time so a project never holds more than one compiler in memory.
//
// --workspace checks folders at the workspace root that belong to no Nx project (scripts/, tools/)
// through their tsconfig.json, and skips a folder that holds no TypeScript of its own rather than
// failing on a config that matches nothing.
//
// A nested Nx project (a directory under the checked root with its own project.json and
// tsconfig.json) is checked by its own typecheck target, so its files are left out here even when a
// broad include such as `**/*.ts` matches them.

import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

export function inspectConfigs(ts, configPaths, nestedProjects = []) {
  return configPaths.map(configPath => {
    if (!existsSync(configPath)) {
      return { configPath, problem: 'does not exist' }
    }
    const config = readConfig(ts, configPath)
    if (config.error) {
      return { configPath, problem: config.error }
    }
    // A nested project's files (its specs included) are its own target's to check.
    const inheritedExclusions = config.inheritedExclusions.filter(
      file => !insideAny(nestedProjects, resolve(file)),
    )
    if (inheritedExclusions.length > 0) {
      const examples = inheritedExclusions
        .slice(0, 3)
        .map(file => relative(dirname(configPath), file))
      return {
        configPath,
        problem:
          `an exclude inherited through "extends" removes ${inheritedExclusions.length} ` +
          `file(s) its own include asks for (${examples.join(', ')}). Declare "exclude" in this config.`,
      }
    }
    const fileNames = config.fileNames.filter(file => !insideAny(nestedProjects, resolve(file)))
    if (fileNames.length === 0) {
      return { configPath, problem: 'matches no files, so it checks nothing' }
    }
    return {
      configPath,
      fileCount: fileNames.length,
      fileNames,
      nestedFileCount: config.fileNames.length - fileNames.length,
    }
  })
}

// git is spawned by absolute path, never looked up through PATH. GIT_EXECUTABLE names it on a host
// that installs git somewhere else.
const gitExecutableCandidates = {
  darwin: ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'],
  win32: [
    String.raw`C:\Program Files\Git\cmd\git.exe`,
    String.raw`C:\Program Files (x86)\Git\cmd\git.exe`,
  ],
}[process.platform] ?? ['/usr/bin/git', '/usr/local/bin/git', '/bin/git']

const isFile = path => existsSync(path) && statSync(path).isFile()

export function gitExecutable(env = process.env) {
  const configured = env.GIT_EXECUTABLE
  if (configured) {
    if (!isAbsolute(configured) || !isFile(configured)) {
      throw new Error(`GIT_EXECUTABLE must be an absolute path to the git file; got ${configured}`)
    }
    return configured
  }
  const executable = gitExecutableCandidates.find(isFile)
  if (!executable) {
    throw new Error(
      `git was not found at any of ${gitExecutableCandidates.join(', ')}. Set GIT_EXECUTABLE.`,
    )
  }
  return executable
}

// Directories whose declaration files a build or code generator writes. A tracked .d.ts under one of
// them is output (committed by accident or on purpose), not a source a config has to own; React
// Router's typegen writes route types to .react-router/types and +types folders.
const generatedDirectories = new Set([
  'dist',
  'build',
  'out',
  'out-tsc',
  'coverage',
  'node_modules',
  '.react-router',
  '+types',
])

// A hand-written declaration file (a global augmentation, a `declare module` shim) types the code
// that sees it, so one that no config includes is unchecked and does nothing. Only generated
// declarations are skipped.
export function isGeneratedDeclaration(projectRoot, file) {
  if (!/\.d\.[cm]?ts$/.test(file)) return false
  const segments = relative(projectRoot, dirname(file)).split(sep)
  return segments.some(segment => generatedDirectories.has(segment))
}

function trackedFiles(workspaceRoot, projectRoot) {
  const listed = spawnSync(
    gitExecutable(),
    ['ls-files', '-z', '--', relative(workspaceRoot, projectRoot) || '.'],
    { cwd: workspaceRoot, encoding: 'utf8' },
  )
  if (listed.status !== 0) {
    throw new Error(`git ls-files failed: ${listed.stderr || listed.error?.message}`)
  }
  return listed.stdout.split('\0').filter(Boolean)
}

// A nested project checks its own files only when the typecheck plugin gives it a target: a root
// with both project.json and tsconfig.json. Either file alone gets no target, so its files are
// checked nowhere else.
export function nestedProjectRoots(
  workspaceRoot,
  projectRoot,
  files = trackedFiles(workspaceRoot, projectRoot),
) {
  const tracked = new Set(files)
  const nested = new Set()
  for (const file of files) {
    const directory = dirname(resolve(workspaceRoot, file))
    const sibling = join(dirname(file), 'tsconfig.json').split(sep).join('/')
    if (basename(file) === 'project.json' && directory !== projectRoot && tracked.has(sibling)) {
      nested.add(directory)
    }
  }
  return [...nested]
}

const insideAny = (roots, file) => roots.some(root => isInside(root, file))

const isTypeScriptSource = file => /\.[cm]?tsx?$/.test(file)

// TypeScript's include matching keeps one file per name: of a.ts, a.tsx and a.d.ts in one folder it
// takes a.ts, and a.tsx before a.d.ts (likewise a.mts before a.d.mts). The other file is dropped
// without a word, so it can never be checked under that name.
const shadowingExtensions = [
  ['.ts', '.tsx', '.d.ts'],
  ['.mts', '.d.mts'],
  ['.cts', '.d.cts'],
]

export function shadowingTwin(file, covered) {
  for (const group of shadowingExtensions) {
    const extension = [...group].sort((a, b) => b.length - a.length).find(e => file.endsWith(e))
    if (!extension) continue
    const stem = file.slice(0, -extension.length)
    for (const preferred of group.slice(0, group.indexOf(extension))) {
      if (covered.has(stem + preferred)) return stem + preferred
    }
    return undefined
  }
  return undefined
}

// Tracked TypeScript sources under the project that none of its checked configs compile,
// hand-written declaration files included. A test folder no config includes (apps/web/tests) is
// otherwise invisible to every typecheck. A tracked file deleted from the working tree is not a
// source any more, staged or not.
export function uncoveredFiles(workspaceRoot, projectRoot, inspected) {
  const files = trackedFiles(workspaceRoot, projectRoot)
  const covered = new Set(inspected.flatMap(config => config.fileNames ?? []).map(f => resolve(f)))
  const nestedProjects = nestedProjectRoots(workspaceRoot, projectRoot, files)
  return files
    .map(file => resolve(workspaceRoot, file))
    .filter(file => isTypeScriptSource(file) && !isGeneratedDeclaration(projectRoot, file))
    .filter(file => !covered.has(file) && existsSync(file))
    .filter(file => !insideAny(nestedProjects, file))
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

// tsc cannot take -p together with a file list, so a config whose matches had nested-project files
// removed is compiled here, in process, with the config's own options.
function compileFiles(ts, workspaceRoot, configPath, fileNames) {
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath))
  const program = ts.createProgram({
    rootNames: fileNames,
    options: { ...parsed.options, noEmit: true },
    projectReferences: parsed.projectReferences,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length > 0) {
    const host = {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => workspaceRoot,
      getNewLine: () => '\n',
    }
    const format = process.stdout.isTTY
      ? ts.formatDiagnosticsWithColorAndContext
      : ts.formatDiagnostics
    console.error(format(diagnostics, host))
  }
  return diagnostics.length > 0 ? 1 : 0
}

// Compile every inspected config, one at a time; returns how many failed. A config with files in a
// nested project compiles its own files only; the rest run through tsc.
function compileConfigs(ts, workspaceRoot, inspected, display) {
  let failed = 0
  for (const config of inspected) {
    const nested = config.nestedFileCount
      ? `, ${config.nestedFileCount} in nested projects left to them`
      : ''
    console.log(`→ ${display(config.configPath)} (${config.fileCount} files${nested})`)
    const status = config.nestedFileCount
      ? compileFiles(ts, workspaceRoot, config.configPath, config.fileNames)
      : runTsc(workspaceRoot, config.configPath)
    if (status !== 0) failed += 1
  }
  return failed
}

// Report tracked TypeScript files no checked config covers, naming the twin that shadows one.
function reportUncovered(uncovered, inspected, projectRoot, display) {
  const covered = new Set(inspected.flatMap(config => config.fileNames ?? []).map(f => resolve(f)))
  console.error(
    `✖ ${uncovered.length} TypeScript file(s) in ${display(projectRoot)} are in no checked config:`,
  )
  for (const file of uncovered) {
    const twin = shadowingTwin(file, covered)
    const reason = twin
      ? ` (shadowed by ${basename(twin)}: include matching keeps one file per name; rename one)`
      : ''
    console.error(`    ${display(file)}${reason}`)
  }
  console.error('  Add them to the tsconfig that matches how they run (app, lib or spec).')
}

export function main(argv, workspaceRoot = process.cwd()) {
  if (argv[0] === '--workspace') return workspaceMain(argv.slice(1), workspaceRoot)
  const [projectArgument, ...explicitConfigs] = argv
  if (!projectArgument) {
    console.error('Usage: node scripts/typecheck-project.mjs <projectRoot> [tsconfig ...]')
    console.error('       node scripts/typecheck-project.mjs --workspace <folder> [folder ...]')
    return 2
  }
  const ts = loadTypeScript(workspaceRoot)
  const projectRoot = resolve(workspaceRoot, projectArgument)
  const configs = resolveProjectConfigs(ts, projectRoot, explicitConfigs)
  const nestedProjects = nestedProjectRoots(workspaceRoot, projectRoot)
  const inspected = inspectConfigs(ts, configs, nestedProjects)
  const display = path => relative(workspaceRoot, path).split(sep).join('/')

  const broken = inspected.filter(config => config.problem)
  for (const config of broken) {
    console.error(`✖ ${display(config.configPath)}: ${config.problem}`)
  }
  if (broken.length > 0) {
    return 1
  }
  // Uncovered files fail the run, but every config is still compiled, so one run reports both the
  // coverage gap and every type error in what is covered.
  const uncovered = uncoveredFiles(workspaceRoot, projectRoot, inspected)
  const failed = compileConfigs(ts, workspaceRoot, inspected, display)
  if (uncovered.length > 0) reportUncovered(uncovered, inspected, projectRoot, display)
  return failed > 0 || uncovered.length > 0 ? 1 : 0
}

// Folders at the workspace root that belong to no Nx project. A folder with no TypeScript of its own
// (outside nested projects) is skipped, so an empty tools/ does not fail on a config that matches
// nothing.
function workspaceMain(folders, workspaceRoot) {
  if (folders.length === 0) {
    console.error('Usage: node scripts/typecheck-project.mjs --workspace <folder> [folder ...]')
    return 2
  }
  let status = 0
  for (const folder of folders) {
    const root = resolve(workspaceRoot, folder)
    const files = trackedFiles(workspaceRoot, root)
    const nested = nestedProjectRoots(workspaceRoot, root, files)
    const own = files
      .map(file => resolve(workspaceRoot, file))
      .filter(file => isTypeScriptSource(file) && existsSync(file) && !insideAny(nested, file))
    if (own.length === 0) {
      console.log(`· ${folder}: no TypeScript of its own, nothing to check`)
      continue
    }
    status = Math.max(status, main([folder], workspaceRoot))
  }
  return status
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2))
}
