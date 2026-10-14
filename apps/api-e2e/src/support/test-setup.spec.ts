import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Built at runtime, so the fixture is not a credential-shaped literal in the source.
const PASSWORD = ['marker', 'value', String(process.pid)].join('-')
const URL_WITH_PASSWORD = (() => {
  const url = new URL('postgresql://localhost:55999/app_test')
  url.username = 'prisma'
  url.password = PASSWORD
  return url.toString()
})()
// The same secret carried as a query parameter, which libpq also accepts.
const URL_WITH_QUERY_PASSWORD = `postgresql://prisma@localhost:55999/app_test?sslmode=disable&password=${PASSWORD}`
const workspaceRoot = resolve(__dirname, '../../../..')

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('test database logging', () => {
  it('test setup logs the database by host, port and name, never the password', async () => {
    vi.stubEnv('TEST_DATABASE_URL', URL_WITH_PASSWORD)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await import('./test-setup')
    const output = log.mock.calls.flat().join('\n')
    expect(output).toContain('localhost:55999/app_test')
    expect(output).not.toContain(PASSWORD)
  })

  it.each([
    ['start', URL_WITH_PASSWORD],
    ['help', URL_WITH_PASSWORD],
    ['start', URL_WITH_QUERY_PASSWORD],
    ['help', URL_WITH_QUERY_PASSWORD],
  ])('scripts/test-db.sh %s prints %s with no credential-bearing part', (command, databaseUrl) => {
    const bin = mkdtempSync(join(tmpdir(), 'test-db-logging-'))
    roots.push(bin)
    // Docker stands in as always succeeding, so `start` runs to its summary without a container.
    writeFileSync(join(bin, 'docker'), '#!/bin/bash\nexit 0\n', { mode: 0o755 })
    const result = spawnSync('bash', [join(workspaceRoot, 'scripts/test-db.sh'), command], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_DATABASE_URL: databaseUrl,
      },
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('postgresql://localhost:55999/app_test')
    expect(`${result.stdout}${result.stderr}`).not.toContain(PASSWORD)
  })

  it('scripts/test-db.sh url still prints the real URL for callers that connect with it', () => {
    const result = spawnSync('bash', [join(workspaceRoot, 'scripts/test-db.sh'), 'url'], {
      cwd: workspaceRoot,
      env: { ...process.env, TEST_DATABASE_URL: URL_WITH_PASSWORD },
      encoding: 'utf8',
    })
    expect(result.stdout.trim()).toBe(URL_WITH_PASSWORD)
  })
})
