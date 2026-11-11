import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

function readRepoPackage(dir) {
  const path = join(root, dir, 'package.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined
}

describe('vite config module format', () => {
  it('loads no ESM-only plugin from a CommonJS config in this repo', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter(file => existsSync(join(root, file)))
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
