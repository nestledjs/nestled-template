import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const ts = createRequire(import.meta.url)('typescript')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE = /\.[cm]?[jt]sx?$/
const NOT_BUILT = /\.(spec|test|stories)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/
const SKIPPED_FOLDERS = new Set(['node_modules', 'build', 'dist', 'tests', '.react-router'])
// Vite's own constants on import.meta.env, set by the mode and the config rather than by a variable.
const VITE_CONSTANTS = new Set(['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'])
// Parts of a Vite config that only the dev server, the preview server or the tests read.
const NOT_BUILD_OPTIONS = new Set(['server', 'preview', 'test'])
// Set by Vitest itself, never for a build.
const SET_BY_THE_RUNNER = new Set(['VITEST'])

const posix = path => path.split(sep).join('/')

function sourceFiles(folder, files = []) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) sourceFiles(path, files)
    } else if (SOURCE.test(entry.name) && !NOT_BUILT.test(entry.name)) files.push(path)
  }
  return files
}

const parse = (text, fileName) =>
  ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

const isEnvObject = (node, owner) =>
  ts.isPropertyAccessExpression(node) &&
  node.name.text === 'env' &&
  (owner === 'import.meta'
    ? ts.isMetaProperty(node.expression)
    : ts.isIdentifier(node.expression) && node.expression.text === owner)

/** `as` casts, `!` and parentheses around an env object, outermost first. */
function unwrapParent(node) {
  let current = node
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent
  }
  return current
}

/** The names read from an env object, or `undefined` for a read whose names cannot be known. */
function namesReadFrom(envNode) {
  const node = unwrapParent(envNode)
  const { parent } = node
  if (ts.isPropertyAccessExpression(parent)) return [parent.name.text]
  if (ts.isElementAccessExpression(parent) && parent.expression === node) {
    const key = parent.argumentExpression
    return ts.isStringLiteralLike(key) ? [key.text] : undefined
  }
  if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
    const { elements } = parent.name
    if (elements.some(element => element.dotDotDotToken)) return undefined
    return elements.map(element => (element.propertyName ?? element.name).getText())
  }
  return undefined
}

/**
 * The environment variables a source file has inlined into the bundle: every VITE_* read of
 * import.meta.env or process.env. `unknown` holds reads of the whole import.meta.env object, whose
 * names cannot be known.
 */
function inlinedReads(text, fileName) {
  const source = parse(text, fileName)
  const names = new Set()
  const unknown = []
  const visit = node => {
    if (isEnvObject(node, 'import.meta')) {
      const read = namesReadFrom(node)
      if (read) read.filter(name => !VITE_CONSTANTS.has(name)).forEach(name => names.add(name))
      else unknown.push(`${fileName}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`)
    } else if (isEnvObject(node, 'process')) {
      const read = namesReadFrom(node) ?? []
      read.filter(name => name.startsWith('VITE_')).forEach(name => names.add(name))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { names, unknown }
}

/** The variables a build config reads outside its dev server, preview and test options. */
function configReads(text, fileName) {
  const names = new Set()
  const visit = node => {
    if (ts.isPropertyAssignment(node) && NOT_BUILD_OPTIONS.has(node.name.getText())) return
    if (isEnvObject(node, 'process')) {
      const read = namesReadFrom(node) ?? []
      read.filter(name => !SET_BY_THE_RUNNER.has(name)).forEach(name => names.add(name))
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(text, fileName))
  return names
}

function importedSpecifiers(text) {
  return ts.preProcessFile(text, true, true).importedFiles.map(({ fileName }) => fileName)
}

function readJson(path) {
  const { config, error } = ts.readConfigFile(path, ts.sys.readFile)
  assert.equal(error, undefined, `${path} is not readable`)
  return config
}

/** The `src` folder of each workspace library, by the specifier tsconfig.base.json maps to it. */
function libraryFolders(workspace) {
  const { paths = {} } = readJson(join(workspace, 'tsconfig.base.json')).compilerOptions ?? {}
  return Object.entries(paths).flatMap(([specifier, [target]]) => {
    const folder = /^(?:\.\/)?(libs\/.+?\/src)\//.exec(target)?.[1]
    return folder && existsSync(join(workspace, folder))
      ? [{ prefix: specifier.replace(/\/?\*$/, ''), folder: join(workspace, folder) }]
      : []
  })
}

/** The app's own source and that of every workspace library it reaches. */
function builtFiles(workspace, appFolder) {
  const libraries = libraryFolders(workspace)
  const files = new Set()
  const reached = new Set()
  const queue = sourceFiles(appFolder)
  while (queue.length > 0) {
    const file = queue.pop()
    if (files.has(file)) continue
    files.add(file)
    for (const specifier of importedSpecifiers(readFileSync(file, 'utf8'))) {
      for (const { prefix, folder } of libraries) {
        if (specifier !== prefix && !specifier.startsWith(`${prefix}/`)) continue
        if (reached.has(folder)) continue
        reached.add(folder)
        queue.push(...sourceFiles(folder))
      }
    }
  }
  return [...files]
}

const CONFIG = /^(vite|react-router)\.config\.[cm]?[jt]s$/

/** Whether Vite (or React Router, which runs Vite) builds the app, by a target of its own or inferred. */
function builtByVite(folder) {
  const { build } = readJson(join(folder, 'project.json')).targets ?? {}
  // An entry that names no command only adjusts the inferred target.
  if (build?.executor ?? build?.command ?? build?.options?.command ?? build?.options?.commands)
    return /vite|react-router/.test(JSON.stringify(build))
  return readdirSync(folder).some(name =>
    /^(index\.html|react-router\.config\.[cm]?[jt]s)$/.test(name),
  )
}

function viteApps(workspace) {
  return readdirSync(join(workspace, 'apps'))
    .map(name => join(workspace, 'apps', name))
    .filter(folder => existsSync(join(folder, 'project.json')))
    .filter(folder => readdirSync(folder).some(name => CONFIG.test(name)))
    .filter(builtByVite)
}

/** What `app`'s build inlines that its `build.inputs` does not list. */
function missingInputs(workspace, appFolder) {
  const needed = new Map([['NODE_ENV', 'Vite (process.env.NODE_ENV, import.meta.env.DEV)']])
  const unknown = []
  const need = (names, file) => {
    for (const name of names)
      if (!needed.has(name)) needed.set(name, posix(relative(workspace, file)))
  }
  for (const file of builtFiles(workspace, appFolder)) {
    const name = posix(relative(workspace, file))
    const text = readFileSync(file, 'utf8')
    if (dirname(file) === appFolder && CONFIG.test(name.split('/').pop())) {
      need(configReads(text, name), file)
      continue
    }
    const reads = inlinedReads(text, name)
    need(reads.names, file)
    unknown.push(...reads.unknown)
  }
  const inputs = readJson(join(appFolder, 'project.json')).targets?.build?.inputs ?? []
  const listed = new Set(inputs.flatMap(input => (input?.env ? [input.env] : [])))
  const missing = [...needed].filter(([name]) => !listed.has(name))
  return { missing, unknown, needed: [...needed.keys()] }
}

/**
 * Nx replays a cached build when the target's inputs are unchanged. A variable Vite inlines that is
 * not an input is invisible to that check, so a build with another value restores a bundle holding
 * the old one: a page that calls another environment's API.
 */
describe('a web build is cached by every environment variable it inlines', () => {
  const apps = viteApps(root)

  for (const app of apps) {
    const project = posix(relative(root, app))
    it(`${project}: build.inputs lists each one`, () => {
      const { missing, unknown } = missingInputs(root, app)
      assert.deepEqual(
        missing.map(([name, where]) => `{ "env": "${name}" } (read in ${where})`),
        [],
        `add these to targets.build.inputs in ${project}/project.json`,
      )
      assert.deepEqual(unknown, [], 'read each variable by its name: import.meta.env.VITE_NAME')
    })
  }

  const hasWebApp = existsSync(join(root, 'apps/web/project.json'))
  it('checks the web app', { skip: !hasWebApp && 'no apps/web here' }, () => {
    const { needed } = missingInputs(root, join(root, 'apps/web'))
    assert.ok(needed.includes('VITE_API_URL'), needed.join(', '))
  })

  it('finds a read in every form', () => {
    const names = text => [...inlinedReads(text, 'file.tsx').names]
    assert.deepEqual(names('const a = import.meta.env.VITE_A'), ['VITE_A'])
    assert.deepEqual(names("const a = import.meta.env['VITE_A']"), ['VITE_A'])
    assert.deepEqual(names('const a = (import.meta.env as Env).VITE_A'), ['VITE_A'])
    assert.deepEqual(names('const a = import.meta.env?.VITE_A'), ['VITE_A'])
    assert.deepEqual(names('const { VITE_A, VITE_B: b } = import.meta.env'), ['VITE_A', 'VITE_B'])
    assert.deepEqual(names("const a = process.env['VITE_A'] ?? process.env.API_KEY"), ['VITE_A'])
    assert.deepEqual(names('// import.meta.env.VITE_A\nif (import.meta.env.DEV) f()'), [])
  })

  it('reports a read whose names cannot be known', () => {
    for (const text of ['f(import.meta.env)', 'import.meta.env[name]']) {
      assert.deepEqual(inlinedReads(text, 'file.ts').unknown, ['file.ts:1'], text)
    }
  })

  it("takes a config's reads, but not its dev server's, preview's or tests'", () => {
    const config = `export default {
      define: { 'process.env.VITE_A': JSON.stringify(process.env.VITE_A || 'x') },
      server: { port: Number(process.env.WEB_PORT) },
      preview: { host: process.env.VITE_HOST },
      test: { watch: !process.env.WATCH },
      plugins: [!process.env.VITEST && upload({ token: process.env.TOKEN })],
    }`
    assert.deepEqual([...configReads(config, 'vite.config.ts')], ['VITE_A', 'TOKEN'])
  })

  it('takes an app whose inferred build only lists its inputs', () => {
    const folder = mkdtempSync(join(tmpdir(), 'web-build-'))
    const withBuild = build =>
      writeFileSync(join(folder, 'project.json'), JSON.stringify({ targets: { build } }))
    try {
      writeFileSync(join(folder, 'vite.config.ts'), '')
      withBuild({ inputs: ['production', { env: 'VITE_A' }] })
      assert.equal(builtByVite(folder), false, 'nothing for Vite to build')
      writeFileSync(join(folder, 'index.html'), '')
      assert.equal(builtByVite(folder), true)
      withBuild({ executor: 'nx:run-commands', options: { command: 'vite build' } })
      assert.equal(builtByVite(folder), true)
      withBuild({ command: 'webpack' })
      assert.equal(builtByVite(folder), false)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
