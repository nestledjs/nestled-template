import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  gitExecutable,
  inspectConfigs,
  isGeneratedDeclaration,
  loadTypeScript,
  main,
  resolveProjectConfigs,
  uncoveredFiles,
} from './typecheck-project.mjs'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const ts = loadTypeScript(workspaceRoot)
const fixtures = []

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'typecheck-project-'))
  fixtures.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  spawnSync(gitExecutable(), ['init', '-q'], { cwd: root })
  spawnSync(gitExecutable(), ['add', '.'], { cwd: root })
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

void describe('typecheck-project', () => {
  void it('resolves the configs a project owns, not references into other projects', () => {
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

  void it('refuses a spec config whose inherited exclude drops every spec', () => {
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

  void it('accepts a spec config that declares its own exclude', () => {
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

  void it('refuses a config that matches no files and a referenced config that is missing', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': solution,
      'libs/a/tsconfig.lib.json': lib,
    })
    const results = inspectConfigs(ts, resolveProjectConfigs(ts, join(root, 'libs/a')))
    assert.match(results[0].problem, /matches no files/)
    assert.match(results[1].problem, /does not exist/)
  })

  void it('reports tracked sources no checked config compiles, tool configs included', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'apps/w/tsconfig.json': { ...solution, references: [{ path: './tsconfig.lib.json' }] },
      'apps/w/tsconfig.lib.json': lib,
      'apps/w/src/main.ts': 'export const main = 1\n',
      'apps/w/tests/main.spec.ts': 'export const test = 1\n',
      'apps/w/vite.config.ts': 'export default {}\n',
      'apps/w/nested/tsconfig.json': { files: [] },
      'apps/w/nested/other.ts': 'export const other = 1\n',
      'apps/w/inner/project.json': {},
      'apps/w/inner/tsconfig.json': { files: [] },
      'apps/w/inner/own.ts': 'export const own = 1\n',
      'apps/w/bare/project.json': {},
      'apps/w/bare/bare.ts': 'export const bare = 1\n',
    })
    const projectRoot = join(root, 'apps/w')
    const inspected = inspectConfigs(ts, resolveProjectConfigs(ts, projectRoot))
    // inner/ has project.json and tsconfig.json, so the plugin gives it its own typecheck. bare/
    // (project.json only) and nested/ (tsconfig.json only) get none, so their files are uncovered.
    assert.deepEqual(uncoveredFiles(root, projectRoot, inspected), [
      join(projectRoot, 'bare/bare.ts'),
      join(projectRoot, 'nested/other.ts'),
      join(projectRoot, 'tests/main.spec.ts'),
      join(projectRoot, 'vite.config.ts'),
    ])
  })

  void it('fails on a type error and passes once the project is clean', () => {
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

  void it('does not report a tracked file deleted from the working tree', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': { ...solution, references: [{ path: './tsconfig.lib.json' }] },
      'libs/a/tsconfig.lib.json': lib,
      'libs/a/src/a.ts': 'export const a = 1\n',
      'libs/a/gone.ts': 'export const gone = 1\n',
    })
    unlinkSync(join(root, 'libs/a/gone.ts'))
    const projectRoot = join(root, 'libs/a')
    const inspected = inspectConfigs(ts, resolveProjectConfigs(ts, projectRoot))
    assert.deepEqual(uncoveredFiles(root, projectRoot, inspected), [])
  })

  void it('still compiles every config when files are uncovered, and fails', t => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': { ...solution, references: [{ path: './tsconfig.lib.json' }] },
      'libs/a/tsconfig.lib.json': lib,
      'libs/a/src/a.ts': 'export const a = 1\n',
      'libs/a/loose.ts': 'export const loose = 1\n',
    })
    const log = t.mock.method(console, 'log', () => undefined)
    const error = t.mock.method(console, 'error', () => undefined)
    assert.equal(main(['libs/a'], root), 1)
    assert.ok(log.mock.calls.some(call => String(call.arguments[0]).includes('tsconfig.lib.json')))
    assert.ok(error.mock.calls.some(call => String(call.arguments[0]).includes('libs/a/loose.ts')))
  })

  void it('reports a hand-written declaration file no config includes, not generated ones', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'apps/w/tsconfig.json': { ...solution, references: [{ path: './tsconfig.lib.json' }] },
      'apps/w/tsconfig.lib.json': { ...lib, include: ['src/**/*.ts'] },
      'apps/w/src/main.ts': 'export const main = 1\n',
      'apps/w/src/covered.d.ts': 'declare const covered: number\n',
      'apps/w/load-context.d.ts': 'export {}\ndeclare global { const loose: number }\n',
      'apps/w/types/shim.d.mts': 'export {}\n',
      'apps/w/dist/main.d.ts': 'export declare const main = 1\n',
      'apps/w/build/out-tsc/main.d.ts': 'export declare const main = 1\n',
      'apps/w/.react-router/types/app/+types/root.d.ts': 'export {}\n',
      'apps/w/app/routes/+types/home.d.ts': 'export {}\n',
    })
    const projectRoot = join(root, 'apps/w')
    const inspected = inspectConfigs(ts, resolveProjectConfigs(ts, projectRoot))
    assert.deepEqual(uncoveredFiles(root, projectRoot, inspected), [
      join(projectRoot, 'load-context.d.ts'),
      join(projectRoot, 'types/shim.d.mts'),
    ])
  })

  void it('treats only declarations under build output and typegen folders as generated', () => {
    const project = join(workspaceRoot, 'apps/w')
    assert.equal(isGeneratedDeclaration(project, join(project, 'dist/a.d.ts')), true)
    assert.equal(isGeneratedDeclaration(project, join(project, '.react-router/types/a.d.ts')), true)
    assert.equal(isGeneratedDeclaration(project, join(project, 'app/+types/a.d.ts')), true)
    assert.equal(isGeneratedDeclaration(project, join(project, 'env.d.ts')), false)
    assert.equal(isGeneratedDeclaration(project, join(project, 'src/types/a.d.cts')), false)
    // Only declarations: a source file under dist/ is still a source.
    assert.equal(isGeneratedDeclaration(project, join(project, 'dist/a.ts')), false)
  })

  void it('invalidates every typecheck target on a lockfile change', () => {
    const { typecheckTarget } = require('../tools/nx-plugins/typecheck.js')
    const lockfile = '{workspaceRoot}/pnpm-lock.yaml'
    assert.ok(typecheckTarget('libs/a').inputs.includes(lockfile))
    for (const project of ['apps/api', 'apps/web']) {
      const { targets } = require(join(workspaceRoot, project, 'project.json'))
      assert.ok(targets.typecheck.inputs.includes(lockfile), `${project} typecheck inputs`)
    }
  })

  void it('spawns git from GIT_EXECUTABLE only when it is an absolute path to a file', () => {
    const git = gitExecutable()
    assert.equal(gitExecutable({ GIT_EXECUTABLE: git }), git)
    assert.throws(() => gitExecutable({ GIT_EXECUTABLE: 'git' }), /absolute path/)
    assert.throws(() => gitExecutable({ GIT_EXECUTABLE: join(tmpdir(), 'no-git') }), /absolute/)
    assert.throws(
      () => gitExecutable({ GIT_EXECUTABLE: tmpdir() }),
      /absolute path to the git file/,
    )
  })
})
