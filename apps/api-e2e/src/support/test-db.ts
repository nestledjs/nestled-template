import { execFileSync, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const workspaceRoot = resolve(__dirname, '../../../..')
const sqlRunner = resolve(__dirname, 'sql-runner.mjs')

/**
 * The test database URL: TEST_DATABASE_URL when set, otherwise what `scripts/test-db.sh url` resolves
 * from the repo-root .env. The shell runners ask the same script, so a direct Vitest run and a
 * wrapped one reach the same database, and a clone on another port block needs no edit here.
 */
export function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  const resolved = spawnSync('bash', [resolve(workspaceRoot, 'scripts/test-db.sh'), 'url'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  })
  const url = resolved.status === 0 ? resolved.stdout.trim() : ''
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set and `scripts/test-db.sh url` could not resolve it' +
        `${resolved.error ? ` (${resolved.error.message})` : ''}. Set TEST_DATABASE_URL.`,
    )
  }
  return url
}

export const testDatabaseUrl = resolveTestDatabaseUrl()

/**
 * Run SQL against a database with the `pg` client and return the rows as `psql -At` prints them
 * (columns joined by `|`, one row per line). Values are passed as `:'name'` variables, quoted as
 * literals, never interpolated. Statements run one at a time with autocommit; the first error throws.
 */
export function runSql(
  url: string,
  statement: string,
  variables: Record<string, string> = {},
  timeout?: number,
): string {
  return execFileSync(process.execPath, [sqlRunner], {
    input: JSON.stringify({ url, statement, variables }),
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout,
  })
    .toString()
    .trim()
}

/** Run one statement, or a script, against the test database. See runSql. */
export function sql(statement: string, variables: Record<string, string> = {}): string {
  return runSql(testDatabaseUrl, statement, variables)
}
