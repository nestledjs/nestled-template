import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * No Vite or Vitest config that Node would load as CommonJS imports an ESM-only plugin.
 *
 * `@vitejs/plugin-react` 6 ships ESM only. A `vite.config.ts` in a directory whose nearest
 * package.json is not `"type": "module"` (or that has none, which falls back to the repo root's) is
 * CommonJS to Node, so Nx's project-graph build `require()`s the plugin while another config
 * `import()`s it. In CI that failed at random with "not yet fully loaded", and never locally. A
 * `.mts` config is always ESM. A source-shape check: the race does not reproduce on demand.
 */
const ESM_ONLY_PLUGINS = ['@vitejs/plugin-react']
const CONFIG_NAME = /(^|\/)(vite|vitest)\.config\.(ts|js)$/

/** The `type` of the nearest package.json at or above `dir` within the repo, or `commonjs`. */
export function nearestPackageType(dir, readPackage) {
  let current = dir
  for (;;) {
    const manifest = readPackage(current)
    if (manifest) return manifest.type === 'module' ? 'module' : 'commonjs'
    if (current === '.' || current === '') return 'commonjs'
    const parent = dirname(current)
    current = parent === current ? '.' : parent
  }
}

/** Plugins from ESM_ONLY_PLUGINS that `source` imports, ignoring comments. */
export function esmOnlyImports(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return ESM_ONLY_PLUGINS.filter(plugin =>
    new RegExp(String.raw`(from|import|require\()\s*\(?\s*['"]${plugin}['"]`).test(code),
  )
}

/** Each tracked config that loads as CommonJS and imports an ESM-only plugin. */
export function commonJsConfigsWithEsmOnlyPlugins(files, readFile, readPackage) {
  return files
    .filter(file => CONFIG_NAME.test(file))
    .filter(file => nearestPackageType(dirname(file), readPackage) === 'commonjs')
    .flatMap(file => esmOnlyImports(readFile(file)).map(plugin => `${file} imports ${plugin}`))
}

const CODE_FILE = /\.[cm]?[jt]sx?$/
const CONFIG_REFERENCE = /(^|\/)(vite|vitest)\.config(\.[cm]?[jt]s)?$/
/** What an import without an extension resolves to: TypeScript and Vite never try `.mts` for it. */
const EXTENSIONLESS_CANDIDATES = ['.ts', '.js']

/** Relative import specifiers in `source` that name a Vite or Vitest config, ignoring comments. */
export function configImports(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const specifiers = [...code.matchAll(/(?:\bfrom|\bimport\s*\(?)\s*['"](\.{1,2}\/[^'"]+)['"]/g)]
  return specifiers.map(match => match[1]).filter(specifier => CONFIG_REFERENCE.test(specifier))
}

/** The text of each `projects: [...]` array in `code`, brackets matched, strings skipped. */
function projectLists(code) {
  const lists = []
  for (const match of code.matchAll(/\bprojects\s*:\s*\[/g)) {
    const start = match.index + match[0].length
    let depth = 1
    let quote = ''
    let end = start
    for (; end < code.length && depth > 0; end++) {
      const char = code[end]
      if (quote) {
        if (char === '\\') end++
        else if (char === quote) quote = ''
      } else if (char === "'" || char === '"' || char === '`') quote = char
      else if (char === '[') depth++
      else if (char === ']') depth--
    }
    lists.push(code.slice(start, end - 1))
  }
  return lists
}

/**
 * Config paths a Vitest config lists as projects, ignoring comments: the strings in a config's
 * `projects: [...]`, or anywhere in a vitest.workspace file (whose export is the project list).
 * Other strings, such as a coverage exclusion naming a config that may legitimately be absent,
 * are not project paths. A `./` or `../` path is kept: the caller resolves it against the listing
 * file's directory. Import specifiers are left out, since `configImports` checks those with
 * extension substitution.
 */
export function listedConfigPaths(source, { workspace = false } = {}) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/(?:\bfrom|\bimport\s*\(?)\s*['"][^'"]*['"]/g, '')
  return (workspace ? [code] : projectLists(code)).flatMap(list =>
    [...list.matchAll(/['"]([\w./-]+\/(?:vite|vitest)\.config\.[cm]?[jt]s)['"]/g)].map(
      match => match[1],
    ),
  )
}

/** The TypeScript sources an import's JavaScript extension may resolve to. */
const TS_SOURCE_FOR_JS_EXTENSION = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] }

/**
 * Each reference to a Vite or Vitest config that names no tracked file: an import (or a Vitest
 * project path) still pointing at a config that was renamed, such as `./vite.config` or
 * `./vite.config.ts` after libs/web-ui's became vite.config.mts. An import without an extension
 * must find a `.ts` or `.js` config; a `.mts` one is imported by its full name.
 */
export function staleConfigReferences(files, readFile) {
  const tracked = new Set(files)
  // TypeScript and Vite resolve an import's JavaScript extension to its TypeScript source, so
  // `./vite.config.mjs` finds vite.config.mts and `./vite.config.js` finds vite.config.ts. A Vitest
  // project path is read as a literal file, so it must name the file exactly.
  const resolves = (path, isImport) => {
    if (!CONFIG_REFERENCE.exec(path)?.[3]) {
      return EXTENSIONLESS_CANDIDATES.some(extension => tracked.has(path + extension))
    }
    if (tracked.has(path)) return true
    const source = isImport ? TS_SOURCE_FOR_JS_EXTENSION[posix.extname(path)] : undefined
    return (source ?? []).some(extension =>
      tracked.has(path.slice(0, -posix.extname(path).length) + extension),
    )
  }
  return files
    .filter(file => CODE_FILE.test(file))
    .flatMap(file => {
      const source = readFile(file)
      const imports = configImports(source).map(specifier => ({
        specifier,
        path: posix.normalize(posix.join(posix.dirname(file), specifier)),
        isImport: true,
      }))
      const listing = /(^|\/)vitest\.(config|workspace)\.[cm]?[jt]s$/.exec(file)
      const listed = listing
        ? listedConfigPaths(source, { workspace: listing[2] === 'workspace' }).map(path => ({
            specifier: path,
            path: posix.normalize(posix.join(posix.dirname(file), path)),
          }))
        : []
      return [...imports, ...listed]
        .filter(reference => !resolves(reference.path, reference.isImport))
        .map(reference => `${file} names ${reference.specifier}, which is no tracked config`)
    })
}

function readRepoPackage(dir) {
  const path = join(root, dir, 'package.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(file => existsSync(join(root, file)))
}

describe('vite config module format', () => {
  it('loads no ESM-only plugin from a CommonJS config in this repo', () => {
    const files = trackedFiles()
    const offenders = commonJsConfigsWithEsmOnlyPlugins(
      files,
      file => readFileSync(join(root, file), 'utf8'),
      readRepoPackage,
    )
    assert.deepEqual(offenders, [], 'rename these configs to .mts')
  })

  it('flags a .ts config with no package.json of its own under a CommonJS root', () => {
    const packages = { '.': { name: 'root' } }
    const offenders = commonJsConfigsWithEsmOnlyPlugins(
      ['libs/ui/vite.config.ts', 'libs/ui/vite.config.mts'],
      () => "import react from '@vitejs/plugin-react'\n",
      dir => packages[dir],
    )
    assert.deepEqual(offenders, ['libs/ui/vite.config.ts imports @vitejs/plugin-react'])
  })

  it('accepts a .ts config whose nearest package.json is an ES module', () => {
    const packages = { '.': { name: 'root' }, 'libs/ui': { type: 'module' } }
    const offenders = commonJsConfigsWithEsmOnlyPlugins(
      ['libs/ui/vite.config.ts'],
      () => "import react from '@vitejs/plugin-react'\n",
      dir => packages[dir],
    )
    assert.deepEqual(offenders, [])
  })

  it('ignores a plugin named only in a comment', () => {
    assert.deepEqual(esmOnlyImports("// import react from '@vitejs/plugin-react'\n"), [])
    assert.deepEqual(esmOnlyImports("/* from '@vitejs/plugin-react' */\nexport default {}\n"), [])
  })
})

describe('references to vite and vitest configs', () => {
  it('every import and Vitest project path in this repo names a tracked config', () => {
    // This spec's own fixtures below are import-shaped strings naming configs that do not exist.
    const self = 'scripts/vite-config-module-format.spec.mjs'
    const files = trackedFiles().filter(file => file !== self)
    const stale = staleConfigReferences(files, file => readFileSync(join(root, file), 'utf8'))
    assert.deepEqual(stale, [], 'point these at the renamed config')
  })

  const files = {
    'libs/ui/vite.config.mts': 'export default {}\n',
    'apps/a/vite.config.ts': 'export default {}\n',
  }
  const check = (file, source) =>
    staleConfigReferences([...Object.keys(files), file], path => files[path] ?? source)

  it('flags an import of a config renamed to .mts, with or without an extension', () => {
    const file = 'libs/ui/vitest.unit.config.mts'
    assert.deepEqual(check(file, "import viteConfig from './vite.config'\n"), [
      `${file} names ./vite.config, which is no tracked config`,
    ])
    assert.deepEqual(check(file, "import viteConfig from './vite.config.ts'\n"), [
      `${file} names ./vite.config.ts, which is no tracked config`,
    ])
  })

  it('accepts the full .mts name and an extensionless import of a .ts config', () => {
    assert.deepEqual(check('libs/ui/vitest.config.mts', "import c from './vite.config.mts'\n"), [])
    assert.deepEqual(check('apps/a/tests/x.spec.ts', "import c from '../vite.config'\n"), [])
    assert.deepEqual(check('apps/a/tests/y.spec.ts', "await import('../vite.config.ts')\n"), [])
  })

  it('accepts a JavaScript extension that resolves to the TypeScript config', () => {
    assert.deepEqual(
      check('libs/ui/vitest.unit.config.mts', "import c from './vite.config.mjs'\n"),
      [],
    )
    assert.deepEqual(check('apps/a/tests/z.spec.ts', "import c from '../vite.config.js'\n"), [])
    assert.deepEqual(check('apps/a/tests/w.spec.ts', "import c from '../vite.config.mjs'\n"), [
      'apps/a/tests/w.spec.ts names ../vite.config.mjs, which is no tracked config',
    ])
  })

  it('reads a Vitest project path literally, with no extension substitution', () => {
    assert.deepEqual(check('vitest.config.ts', "projects: ['libs/ui/vite.config.mjs']\n"), [
      'vitest.config.ts names libs/ui/vite.config.mjs, which is no tracked config',
    ])
  })

  it('resolves a ./ or ../ project path against the listing file, still literally', () => {
    assert.deepEqual(check('vitest.config.ts', "projects: ['./libs/ui/vite.config.ts']\n"), [
      'vitest.config.ts names ./libs/ui/vite.config.ts, which is no tracked config',
    ])
    assert.deepEqual(check('vitest.config.ts', "projects: ['./libs/ui/vite.config.mts']\n"), [])
    assert.deepEqual(check('libs/ui/vitest.workspace.ts', "['../../apps/a/vite.config.ts']\n"), [])
    assert.deepEqual(check('libs/ui/vitest.workspace.ts', "['../../apps/a/vite.config.mts']\n"), [
      'libs/ui/vitest.workspace.ts names ../../apps/a/vite.config.mts, which is no tracked config',
    ])
  })

  it('reads only project lists, not other strings such as a coverage exclusion', () => {
    const source =
      "export default { test: { projects: ['./libs/ui/vite.config.mts'], coverage: { exclude: ['./vite.config.ts', 'libs/x/vite.config.ts'] } } }\n"
    assert.deepEqual(check('vitest.config.ts', source), [])
    assert.deepEqual(
      listedConfigPaths(
        "projects: ['a/vite.config.ts', { extends: './b/vite.config.ts' }], x: ['c/vite.config.ts']",
      ),
      ['a/vite.config.ts', './b/vite.config.ts'],
    )
  })

  it('leaves an import in a Vitest config to the import rule, reported once', () => {
    const file = 'libs/ui/vitest.config.mts'
    assert.deepEqual(check(file, "import c from './vite.config.mjs'\n"), [])
    assert.deepEqual(check(file, "import c from './vite.config.ts'\n"), [
      `${file} names ./vite.config.ts, which is no tracked config`,
    ])
  })

  it('flags a Vitest project path that names no config, ignoring comments', () => {
    const source = "export default { test: { projects: ['libs/ui/vite.config.ts'] } }\n"
    assert.deepEqual(check('vitest.config.ts', source), [
      'vitest.config.ts names libs/ui/vite.config.ts, which is no tracked config',
    ])
    assert.deepEqual(check('vitest.config.ts', "// 'libs/ui/vite.config.ts'\n"), [])
    assert.deepEqual(check('vitest.config.ts', "projects: ['libs/ui/vite.config.mts']\n"), [])
  })
})
