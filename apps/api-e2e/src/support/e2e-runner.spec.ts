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

// Credentials built at runtime, so secret scanners do not read the fixtures as real ones.
const FIXTURE_PASSWORD = ['fixture', 'pw', String(process.pid)].join('-')
const OTHER_PASSWORD = ['other', 'pw', String(process.pid)].join('-')
const SUPPLIED_URL = `postgresql://prisma:${FIXTURE_PASSWORD}@db.local:5599/app_test`

const runWrapper = (
  vitestOutput: string,
  vitestExit: number,
  probeExit = 0,
  stopExit = 0,
  suppliedUrl = SUPPLIED_URL,
  urlExit = 0,
  {
    probeExits = [probeExit],
    probeStderr = '',
    ensureExit = 0,
  }: { probeExits?: number[]; probeStderr?: string; ensureExit?: number } = {},
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
      `if [[ "$1" == stop ]]; then exit ${stopExit}; fi\n` +
      `if [[ "$1" == ensure ]]; then echo "ensure output for ${'$'}TEST_DATABASE_URL"; exit ${ensureExit}; fi\n`,
    { mode: 0o755 },
  )
  // Stands in for the pg runner: records the probe request and answers each probe in turn with the
  // next of probeExits (the last one repeats), writing probeStderr when it fails.
  writeFileSync(
    join(root, 'apps/api-e2e/src/support/sql-runner.mjs'),
    "import { existsSync, readFileSync, writeFileSync } from 'node:fs'\n" +
      `const exits = ${JSON.stringify(probeExits)}\n` +
      "const count = existsSync('probe-count') ? Number(readFileSync('probe-count', 'utf8')) : 0\n" +
      "writeFileSync('probe-count', String(count + 1))\n" +
      "writeFileSync('probe', readFileSync(0))\n" +
      'const exit = exits[Math.min(count, exits.length - 1)]\n' +
      `if (exit !== 0) process.stderr.write(${JSON.stringify(probeStderr)})\n` +
      'process.exit(exit)\n',
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
  return {
    result,
    probe: read('probe'),
    probes: Number(read('probe-count') || 0),
    dbCalls: read('db-calls'),
    npxCalls: read('npx-calls'),
  }
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
      url: SUPPLIED_URL,
      statement: 'SELECT 1',
    })
    expect(dbCalls).not.toContain('start')
  })
  it('probes without the query parameters only Prisma reads, and runs with the full URL', () => {
    const url = `${SUPPLIED_URL}?schema=public&sslmode=disable&connection_limit=5&port=5599`
    const { probe, result } = runWrapper(summary('5 passed (5)'), 0, 0, 0, url)
    expect(result.status).toBe(0)
    expect(JSON.parse(probe).url).toBe(`${SUPPLIED_URL}?sslmode=disable&port=5599`)
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
  it('prints why the probe failed, without the URL or its credentials', () => {
    const { result } = runWrapper(summary('5 passed (5)'), 0, 1, 0, SUPPLIED_URL, 0, {
      probeStderr: `connect failed for ${SUPPLIED_URL} via postgres://other:${OTHER_PASSWORD}@db.local/x`,
    })
    expect(result.status).toBe(1)
    const output = `${result.stdout}${result.stderr}`
    expect(output).toContain('Probe error: connect failed for <TEST_DATABASE_URL>')
    expect(output).toContain('postgres://***@db.local/x')
    expect(output).not.toContain(FIXTURE_PASSWORD)
    expect(output).not.toContain(OTHER_PASSWORD)
  })
  it('creates a missing database and runs, without starting a container', () => {
    const { result, dbCalls, probes, npxCalls } = runWrapper(
      summary('5 passed (5)'),
      0,
      1,
      0,
      '',
      0,
      {
        probeExits: [1, 0],
        probeStderr: 'database "app_test" does not exist',
      },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('database "app_test" does not exist')
    expect(dbCalls).toContain('ensure')
    expect(dbCalls).not.toContain('start')
    expect(probes).toBe(2)
    expect(npxCalls).toBe('ran\n')
  })
  it('creates a missing database behind a supplied URL, printing its output scrubbed', () => {
    const { result, dbCalls } = runWrapper(summary('5 passed (5)'), 0, 1, 0, SUPPLIED_URL, 0, {
      probeExits: [1, 0],
    })
    expect(result.status).toBe(0)
    expect(dbCalls).toContain('ensure')
    expect(result.stdout).toContain('ensure output for <TEST_DATABASE_URL>')
    expect(result.stdout).not.toContain(FIXTURE_PASSWORD)
  })
  it('starts its own test database when ensure cannot create one', () => {
    const { result, dbCalls } = runWrapper(summary('5 passed (5)'), 0, 1, 0, '', 0, {
      ensureExit: 1,
    })
    expect(result.status).toBe(0)
    expect(dbCalls).toContain('ensure')
    expect(dbCalls).toContain('start')
  })
  it('finds a failure in the summary of a long log', () => {
    const log = `${'✓ a passing test\n'.repeat(20000)}${summary('1 failed | 4 passed (5)')}`
    const { result } = runWrapper(log, 0)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('the summary counts a failure')
  })
})
