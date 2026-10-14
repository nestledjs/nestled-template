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
  shadowingTwin,
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

  void it('skips a workspace folder with no TypeScript instead of failing on its config', t => {
    const workspaceConfig = { extends: '../tsconfig.base.json', include: ['**/*.ts'] }
    const root = fixture({
      'tsconfig.base.json': base,
      'scripts/tsconfig.json': workspaceConfig,
      'scripts/a.ts': 'export const a: number = 1\n',
      'tools/tsconfig.json': workspaceConfig,
      'tools/plugin.js': 'module.exports = {}\n',
    })
    const log = t.mock.method(console, 'log', () => undefined)
    t.mock.method(console, 'error', () => undefined)
    // Run on its own, the empty folder's config is still refused: it checks nothing.
    assert.equal(main(['tools'], root), 1)
    assert.equal(main(['--workspace', 'scripts', 'tools'], root), 0)
    assert.ok(log.mock.calls.some(call => /tools: no TypeScript/.test(call.arguments[0])))
  })

  void it('leaves a nested Nx project to its own typecheck in a broad include', t => {
    const workspaceConfig = { extends: '../tsconfig.base.json', include: ['**/*.ts'] }
    const files = {
      'tsconfig.base.json': base,
      'tools/tsconfig.json': workspaceConfig,
      'tools/a.ts': 'export const a: number = 1\n',
      'tools/workspace-plugin/project.json': {},
      'tools/workspace-plugin/tsconfig.json': { files: [] },
      // Broken, and checked only by the nested project's own target.
      'tools/workspace-plugin/src/index.ts': 'export const broken: number = "text"\n',
      'other/tsconfig.json': workspaceConfig,
      'other/plugin/project.json': {},
      'other/plugin/tsconfig.json': { files: [] },
      'other/plugin/index.ts': 'export const nested = 1\n',
    }
    const root = fixture(files)
    const log = t.mock.method(console, 'log', () => undefined)
    t.mock.method(console, 'error', () => undefined)
    const [inspected] = inspectConfigs(
      ts,
      [join(root, 'tools/tsconfig.json')],
      [join(root, 'tools/workspace-plugin')],
    )
    assert.deepEqual(inspected.fileNames, [join(root, 'tools/a.ts')])
    assert.equal(inspected.nestedFileCount, 1)
    assert.equal(main(['--workspace', 'tools'], root), 0)
    assert.ok(log.mock.calls.some(call => /1 in nested projects/.test(call.arguments[0])))
    // A nested spec that the base config's inherited exclude drops is the nested project's concern.
    const withSpec = fixture({
      ...files,
      'tools/tsconfig.json': { extends: '../tsconfig.base.json', include: ['**/*.ts'] },
      'tools/workspace-plugin/src/index.spec.ts': 'export const spec = 1\n',
    })
    assert.equal(main(['--workspace', 'tools'], withSpec), 0)
    const [withSpecInspected] = inspectConfigs(
      ts,
      [join(withSpec, 'tools/tsconfig.json')],
      [join(withSpec, 'tools/workspace-plugin')],
    )
    assert.equal(withSpecInspected.problem, undefined)
    // A folder whose only TypeScript is a nested project's has nothing of its own to check.
    assert.equal(main(['--workspace', 'other'], root), 0)
    // The kept files are still compiled: a type error in one fails the run.
    const broken = fixture({ ...files, 'tools/a.ts': 'export const a: number = "text"\n' })
    assert.equal(main(['--workspace', 'tools'], broken), 1)
  })

  void it('reports a file that a same-named twin shadows from include matching', t => {
    const root = fixture({
      'tsconfig.base.json': base,
      'libs/a/tsconfig.json': { ...solution, references: [{ path: './tsconfig.spec.json' }] },
      'libs/a/tsconfig.spec.json': {
        extends: './tsconfig.json',
        compilerOptions: { jsx: 'react-jsx' },
        include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
        exclude: ['node_modules'],
      },
      'libs/a/src/a.spec.ts': 'export const a = 1\n',
      'libs/a/src/a.spec.tsx': 'export const b = 2\n',
    })
    const projectRoot = join(root, 'libs/a')
    const inspected = inspectConfigs(ts, resolveProjectConfigs(ts, projectRoot))
    assert.deepEqual(uncoveredFiles(root, projectRoot, inspected), [
      join(projectRoot, 'src/a.spec.tsx'),
    ])
    const error = t.mock.method(console, 'error', () => undefined)
    t.mock.method(console, 'log', () => undefined)
    assert.equal(main(['libs/a'], root), 1)
    assert.ok(
      error.mock.calls.some(call =>
        /libs\/a\/src\/a\.spec\.tsx \(shadowed by a\.spec\.ts/.test(call.arguments[0]),
      ),
    )
  })

  void it('names the twin TypeScript prefers for each extension pair', () => {
    const covered = new Set(['/p/a.ts', '/p/b.tsx', '/p/c.mts'])
    assert.equal(shadowingTwin('/p/a.tsx', covered), '/p/a.ts')
    assert.equal(shadowingTwin('/p/a.d.ts', covered), '/p/a.ts')
    assert.equal(shadowingTwin('/p/b.d.ts', covered), '/p/b.tsx')
    assert.equal(shadowingTwin('/p/c.d.mts', covered), '/p/c.mts')
    assert.equal(shadowingTwin('/p/a.ts', covered), undefined)
    assert.equal(shadowingTwin('/p/d.tsx', covered), undefined)
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
