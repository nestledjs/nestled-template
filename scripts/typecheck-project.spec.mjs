import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  inspectConfigs,
  loadTypeScript,
  main,
  resolveProjectConfigs,
  uncoveredFiles,
} from './typecheck-project.mjs'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const ts = loadTypeScript(workspaceRoot)
const fixtures = []

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'typecheck-project-'))
  fixtures.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  spawnSync('git', ['init', '-q'], { cwd: root })
  spawnSync('git', ['add', '.'], { cwd: root })
  return root
}

const base = { compilerOptions: { strict: true, noEmit: true }, exclude: ['**/*.spec.ts'] }
const solution = {
  extends: '../../tsconfig.base.json',
  files: [],
  include: [],
  references: [{ path: './tsconfig.lib.json' }, { path: './tsconfig.spec.json' }],
}
const lib = { extends: './tsconfig.json', include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts'] }

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('typecheck-project', () => {
  it('resolves the configs a project owns, not references into other projects', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': {
        ...solution,
        references: [...solution.references, { path: '../b' }],
      },
    })
    const configs = resolveProjectConfigs(ts, join(root, 'libs/a'))
    assert.deepEqual(configs, [
      join(root, 'libs/a/tsconfig.lib.json'),
      join(root, 'libs/a/tsconfig.spec.json'),
    ])
  })

  it('refuses a spec config whose inherited exclude drops every spec', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': solution,
      'libs/a/tsconfig.spec.json': {
        extends: './tsconfig.json',
        include: ['vite.config.ts', 'src/**/*.spec.ts'],
      },
      'libs/a/vite.config.ts': 'export default {}\n',
      'libs/a/src/a.spec.ts': 'export const checked = true\n',
    })
    const [result] = inspectConfigs(ts, [join(root, 'libs/a/tsconfig.spec.json')])
    assert.match(result.problem, /inherited through "extends" removes 1 file/)
  })

  it('accepts a spec config that declares its own exclude', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': solution,
      'libs/a/tsconfig.spec.json': {
        extends: './tsconfig.json',
        include: ['src/**/*.spec.ts'],
        exclude: ['node_modules'],
      },
      'libs/a/src/a.spec.ts': 'export const checked = true\n',
    })
    const [result] = inspectConfigs(ts, [join(root, 'libs/a/tsconfig.spec.json')])
    assert.equal(result.problem, undefined)
    assert.equal(result.fileCount, 1)
  })

  it('refuses a config that matches no files and a referenced config that is missing', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': solution,
      'libs/a/tsconfig.lib.json': lib,
    })
    const results = inspectConfigs(ts, resolveProjectConfigs(ts, join(root, 'libs/a')))
    assert.match(results[0].problem, /matches no files/)
    assert.match(results[1].problem, /does not exist/)
  })

  it('reports tracked sources no checked config compiles, tool configs included', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'apps/w/tsconfig.json': { ...solution, references: [{ path: './tsconfig.lib.json' }] },
      'apps/w/tsconfig.lib.json': lib,
      'apps/w/src/main.ts': 'export const main = 1\n',
      'apps/w/tests/main.spec.ts': 'export const test = 1\n',
      'apps/w/vite.config.ts': 'export default {}\n',
      'apps/w/nested/tsconfig.json': { files: [] },
      'apps/w/nested/other.ts': 'export const other = 1\n',
    })
    const projectRoot = join(root, 'apps/w')
    const inspected = inspectConfigs(ts, resolveProjectConfigs(ts, projectRoot))
    assert.deepEqual(uncoveredFiles(root, projectRoot, inspected), [
      join(projectRoot, 'tests/main.spec.ts'),
      join(projectRoot, 'vite.config.ts'),
    ])
  })

  it('fails on a type error and passes once the project is clean', () => {
    const files = {
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': { ...solution, references: [{ path: './tsconfig.lib.json' }] },
      'libs/a/tsconfig.lib.json': lib,
      'libs/a/src/a.ts': 'export const value: number = "text"\n',
    }
    const broken = fixture(files)
    assert.equal(main(['libs/a'], broken), 1)
    const clean = fixture({ ...files, 'libs/a/src/a.ts': 'export const value: number = 1\n' })
    assert.equal(main(['libs/a'], clean), 0)
  })
})
