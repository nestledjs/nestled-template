import { execFileSync } from 'node:child_process'

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/nestled_template_test'

/**
 * Run one statement against the test database and return its unaligned, tuples-only output.
 * Values are passed as psql variables (`:'name'` in the statement), never interpolated.
 */
export function sql(statement: string, variables: Record<string, string> = {}): string {
  const url = new URL(testDatabaseUrl)
  const args = [
    '-U',
    url.username || 'postgres',
    '-h',
    url.hostname || 'localhost',
    '-p',
    url.port || '5432',
    '-d',
    url.pathname.slice(1).split('?')[0],
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
  ]
  for (const [name, value] of Object.entries(variables)) {
    args.push('-v', `${name}=${value}`)
  }
  return execFileSync('psql', args, {
    input: statement,
    env: { ...process.env, PGPASSWORD: url.password || 'postgres' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
    .toString()
    .trim()
}
