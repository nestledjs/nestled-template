import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

const run = (exitCode: number, suppliedUrl?: string) => {
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
    '#!/bin/bash\nif [[ "$1" == url ]]; then echo postgresql://local/test; fi\n',
    { mode: 0o755 },
  )
  writeFileSync(join(root, 'bin/docker'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
  writeFileSync(
    join(root, 'bin/pnpm'),
    '#!/bin/bash\nprintf "%s\\n" "$*" "$TEST_DATABASE_URL" "$DATABASE_URL" "$DIRECT_URL" >> calls\nexit "$FAKE_EXIT"\n',
    { mode: 0o755 },
  )
  const result = spawnSync('bash', ['scripts/run-e2e-tests.sh'], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      TEST_DATABASE_URL: suppliedUrl ?? '',
      FAKE_EXIT: String(exitCode),
    },
    encoding: 'utf8',
  })
  return { result, calls: readFileSync(join(root, 'calls'), 'utf8').trim().split('\n') }
}

describe('e2e shell runner', () => {
  it('delegates migrations to global setup and pins all URLs to the test database', () => {
    const { result, calls } = run(0)
    expect(result.status).toBe(0)
    expect(calls).toEqual(['nx run api-e2e:test', ...Array(3).fill('postgresql://local/test')])
  })
  it('preserves a caller-provided isolated database URL', () => {
    expect(run(0, 'postgresql://local/isolated_test').calls.slice(1)).toEqual(
      Array(3).fill('postgresql://local/isolated_test'),
    )
  })
  it('propagates a failing test target instead of reporting success', () => {
    const { result } = run(7)
    expect(result.status).toBe(7)
    expect(result.stdout).toContain('Some tests failed')
    expect(result.stdout).not.toContain('All tests passed')
  })
})
