import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

const run = (exitCode: number, suppliedUrl?: string, args: string[] = [], urlExit = 0) => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-shell-runner-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'bin'))
  copyFileSync(
    resolve(__dirname, '../../../../scripts/run-e2e-tests.sh'),
    join(root, 'scripts/run-e2e-tests.sh'),
  )
  writeFileSync(
    join(root, 'scripts/test-db.sh'),
    '#!/bin/bash\necho "$1" >> db-calls\n' +
      `if [[ "$1" == url ]]; then echo postgresql://local/test; exit ${urlExit}; fi\n`,
    { mode: 0o755 },
  )
  writeFileSync(join(root, 'bin/docker'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
  writeFileSync(
    join(root, 'bin/pnpm'),
    '#!/bin/bash\nprintf "%s\\n" "$*" "$TEST_DATABASE_URL" "$DATABASE_URL" "$DIRECT_URL" >> calls\nexit "$FAKE_EXIT"\n',
    { mode: 0o755 },
  )
  const result = spawnSync('bash', ['scripts/run-e2e-tests.sh', ...args], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      TEST_DATABASE_URL: suppliedUrl ?? '',
      FAKE_EXIT: String(exitCode),
    },
    encoding: 'utf8',
  })
  const read = (file: string) => {
    try {
      return readFileSync(join(root, file), 'utf8')
    } catch {
      return ''
    }
  }
  return { result, calls: read('calls').trim().split('\n'), dbCalls: read('db-calls') }
}

describe('e2e shell runner', () => {
  it('delegates migrations to global setup and pins all URLs to the test database', () => {
    const { result, calls } = run(0)
    expect(result.status).toBe(0)
    expect(calls).toEqual(['nx run api-e2e:e2e', ...Array(3).fill('postgresql://local/test')])
  })
  it('starts and stops the repo test database when no URL is supplied', () => {
    const { dbCalls } = run(0)
    expect(dbCalls).toContain('start')
    expect(dbCalls).toContain('stop')
  })
  it('preserves a caller-provided isolated database URL without managing a container', () => {
    const { calls, dbCalls } = run(0, 'postgresql://local/isolated_test')
    expect(calls.slice(1)).toEqual(Array(3).fill('postgresql://local/isolated_test'))
    expect(dbCalls).not.toContain('start')
    expect(dbCalls).not.toContain('stop')
  })
  it('forwards every argument to the e2e target', () => {
    const { calls } = run(0, undefined, ['src/auth/auth-generation.spec.ts', '--coverage'])
    expect(calls[0]).toBe('nx run api-e2e:e2e -- src/auth/auth-generation.spec.ts --coverage')
  })
  it('fails, running no test, when test-db.sh cannot resolve the URL', () => {
    const { result, calls, dbCalls } = run(0, undefined, [], 3)
    expect(dbCalls).toContain('url')
    expect(result.status).toBe(3)
    expect(calls).toEqual([''])
    expect(result.stdout).not.toContain('All tests passed')
  })
  it('propagates a failing test target instead of reporting success', () => {
    const { result } = run(7)
    expect(result.status).toBe(7)
    expect(result.stdout).toContain('Some tests failed')
    expect(result.stdout).not.toContain('All tests passed')
  })
})

const SUPPLIED_URL = 'postgresql://prisma:secret@db.local:5599/app_test'

const runWrapper = (
  vitestOutput: string,
  vitestExit: number,
  probeExit = 0,
  stopExit = 0,
  suppliedUrl = SUPPLIED_URL,
  urlExit = 0,
) => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-test-wrapper-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'bin'))
  mkdirSync(join(root, 'apps/api-e2e/src/support'), { recursive: true })
  copyFileSync(resolve(__dirname, '../../run-tests.sh'), join(root, 'apps/api-e2e/run-tests.sh'))
  writeFileSync(
    join(root, 'scripts/test-db.sh'),
    '#!/bin/bash\necho "$1" >> db-calls\n' +
      `if [[ "$1" == url ]]; then echo postgresql://local/test; exit ${urlExit}; fi\n` +
      `if [[ "$1" == stop ]]; then exit ${stopExit}; fi\n`,
    { mode: 0o755 },
  )
  // Stands in for the pg runner: records the probe request and answers with the probe's result.
  writeFileSync(
    join(root, 'apps/api-e2e/src/support/sql-runner.mjs'),
    "import { readFileSync, writeFileSync } from 'node:fs'\n" +
      `writeFileSync('probe', readFileSync(0))\nprocess.exit(${probeExit})\n`,
  )
  writeFileSync(join(root, 'bin/docker'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
  writeFileSync(join(root, 'vitest-output'), vitestOutput)
  writeFileSync(
    join(root, 'bin/npx'),
    `#!/bin/bash\necho ran >> npx-calls\ncat vitest-output\nexit ${vitestExit}\n`,
    { mode: 0o755 },
  )
  const result = spawnSync('bash', ['apps/api-e2e/run-tests.sh'], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      TEST_DATABASE_URL: suppliedUrl,
    },
    encoding: 'utf8',
  })
  const read = (file: string) => {
    try {
      return readFileSync(join(root, file), 'utf8')
    } catch {
      return ''
    }
  }
  return { result, probe: read('probe'), dbCalls: read('db-calls'), npxCalls: read('npx-calls') }
}

const summary = (tests: string) => `\n Test Files  2 passed (2)\n      Tests  ${tests}\n`

describe('api-e2e test wrapper', () => {
  it('reports a pass with the number of tests that passed', () => {
    const { result } = runWrapper(summary('5 passed (5)'), 0)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('E2E Tests PASSED (5 tests)')
  })
  it('fails a run in which every test was skipped', () => {
    const { result } = runWrapper(summary('4 skipped (4)'), 0)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('no test passed')
    expect(result.stdout).not.toContain('PASSED')
  })
  it('fails a run that found no test files', () => {
    const { result } = runWrapper('No test files found, exiting with code 1\n', 1)
    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain('PASSED')
  })
  it('fails a run whose summary counts a failure', () => {
    const { result } = runWrapper(summary('1 failed | 4 passed (5)'), 1)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('E2E Tests FAILED')
  })
  it('fails a zero exit whose summary counts a failure', () => {
    const { result } = runWrapper(summary('1 failed | 4 passed (5)'), 0)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('the summary counts a failure')
    expect(result.stdout).not.toContain('PASSED')
  })
  it('fails a non-zero exit even when the summary shows only passes', () => {
    const { result } = runWrapper(summary('5 passed (5)'), 137)
    expect(result.status).toBe(137)
    expect(result.stdout).not.toContain('PASSED')
  })
  it('probes the database with the URL and its own credentials, starting no container', () => {
    const { probe, dbCalls } = runWrapper(summary('5 passed (5)'), 0)
    expect(JSON.parse(probe)).toEqual({
      url: 'postgresql://prisma:secret@db.local:5599/app_test',
      statement: 'SELECT 1',
    })
    expect(dbCalls).not.toContain('start')
  })
  it('starts its own test database when no URL was supplied and the probe fails', () => {
    expect(runWrapper(summary('5 passed (5)'), 0, 1, 0, '').dbCalls).toContain('start')
  })
  it('fails without starting a container when a supplied URL is unreachable', () => {
    const { result, dbCalls } = runWrapper(summary('5 passed (5)'), 0, 1)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('TEST_DATABASE_URL is set but that database is not accessible')
    expect(dbCalls).not.toContain('start')
    expect(result.stdout).not.toContain('PASSED')
  })
  it('stops the test database it started, and warns when that fails without changing the result', () => {
    const stopped = runWrapper(summary('5 passed (5)'), 0, 1, 0, '')
    expect(stopped.dbCalls).toContain('stop')
    expect(stopped.result.stderr).not.toContain('could not stop')
    const stuck = runWrapper(summary('5 passed (5)'), 0, 1, 1, '')
    expect(stuck.result.status).toBe(0)
    expect(stuck.result.stderr).toContain('could not stop it')
  })
  it('fails before probing or testing when test-db.sh cannot resolve the URL', () => {
    const { result, probe, dbCalls, npxCalls } = runWrapper(summary('5 passed (5)'), 0, 0, 0, '', 4)
    expect(dbCalls).toContain('url')
    expect(result.status).toBe(4)
    expect(probe).toBe('')
    expect(npxCalls).toBe('')
    expect(result.stdout).not.toContain('PASSED')
  })
  it('finds a failure in the summary of a long log', () => {
    const log = `${'✓ a passing test\n'.repeat(20000)}${summary('1 failed | 4 passed (5)')}`
    const { result } = runWrapper(log, 0)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('the summary counts a failure')
  })
})
