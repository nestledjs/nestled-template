// Checks global setup makes on the test database URL before it touches the database. Side-effect
// free (unlike test-db.ts, which resolves the URL on import), so the support suite tests them alone.

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

// Query parameters that pg and libpq read as the connection's destination, overriding the URL's
// host, port or path. A URL carrying one could pass the host and name check and still connect
// elsewhere.
export const DESTINATION_OVERRIDES = [
  'host',
  'hostaddr',
  'port',
  'database',
  'dbname',
  'db',
  'service',
] as const

/** The opt-out for a test database that does not look disposable. */
export const ALLOW_NON_DISPOSABLE_DB = 'E2E_ALLOW_NON_DISPOSABLE_DB'

/** A URL's host and database name, without its credentials, for messages and logs. */
export function describeDatabase(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    return `${url.host}/${decodeURIComponent(url.pathname.slice(1))}`
  } catch {
    return '(an unparseable URL)'
  }
}

/**
 * Whether a URL names a database this suite may migrate, push, seed and wipe: on this machine (the
 * rule prisma.config.ts applies to `migrate reset`), and named as a test database, ending in `_test`
 * (`nestled_template_test` by default). A URL whose query parameters override the destination
 * (`?host=`, `?port=`, `?dbname=` and the like) is never disposable, since pg would connect there.
 */
export function isDisposableTestDatabase(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl)
    const database = decodeURIComponent(url.pathname.slice(1))
    const params = [...url.searchParams.keys()].map(key => key.toLowerCase())
    if (params.some(key => (DESTINATION_OVERRIDES as readonly string[]).includes(key))) return false
    return LOCAL_DATABASE_HOSTS.has(url.hostname) && /_test$/i.test(database)
  } catch {
    return false
  }
}

/**
 * Refuse a test database that is not disposable before global setup migrates, pushes and seeds it.
 * A TEST_DATABASE_URL copied from DATABASE_URL, or one pointing at a shared host, would otherwise
 * have its schema rewritten and its data seeded over. `E2E_ALLOW_NON_DISPOSABLE_DB=1` is the opt-out
 * for a database you know is disposable under another name or host (a CI service container reached
 * by its service name, for example). Even then, setup only empties a schema that passes the rule.
 */
export function assertDisposableTestDatabase(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): 'disposable' | 'allowed' {
  if (isDisposableTestDatabase(databaseUrl)) return 'disposable'
  if (env[ALLOW_NON_DISPOSABLE_DB] === '1') return 'allowed'
  throw new Error(
    [
      `Refusing to run e2e setup against ${describeDatabase(databaseUrl)}.`,
      `Setup migrates, pushes the schema to and seeds the test database, so it must be disposable:`,
      `on this machine (localhost, 127.0.0.1 or ::1) and named *_test.`,
      ``,
      `Point TEST_DATABASE_URL at a disposable database, or, if this one is disposable under another`,
      `name or host, say so explicitly:  ${ALLOW_NON_DISPOSABLE_DB}=1`,
    ].join('\n'),
  )
}

export type DatabaseProbe = 'pg' | 'psql'

/**
 * How global setup checks that the test database answers. `pg` (the default) runs `SELECT 1`
 * through the suite's pg runner and needs no psql binary. `E2E_DATABASE_PROBE=psql` runs psql from
 * PATH instead, for a repo whose own lifecycle tests stand in for the database with a stub psql.
 */
export function databaseProbe(env: NodeJS.ProcessEnv = process.env): DatabaseProbe {
  const probe = env.E2E_DATABASE_PROBE || 'pg'
  if (probe === 'pg' || probe === 'psql') return probe
  throw new Error(`E2E_DATABASE_PROBE must be "pg" or "psql"; got "${probe}"`)
}

/**
 * The libpq environment for a URL, so psql connects without the URL (and its password) on its
 * command line, where any process listing would show it.
 */
export function psqlEnvironment(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl)
  const environment: Record<string, string> = {
    PGHOST: url.hostname.replace(/^\[(.*)\]$/, '$1'),
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  }
  if (url.username) environment.PGUSER = decodeURIComponent(url.username)
  if (url.password) environment.PGPASSWORD = decodeURIComponent(url.password)
  const sslMode = url.searchParams.get('sslmode')
  if (sslMode) environment.PGSSLMODE = sslMode
  return environment
}

/**
 * The whole environment for the psql probe: the caller's environment without any inherited libpq
 * variable (PGHOSTADDR, PGSERVICE, PGPASSFILE, a stale PGPASSWORD...), which could send psql
 * somewhere other than the URL or log in with other credentials, plus the URL's own variables.
 */
export function psqlProcessEnvironment(
  databaseUrl: string,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(inherited)) {
    if (!/^PG/i.test(key)) environment[key] = value
  }
  return { ...environment, ...psqlEnvironment(databaseUrl) }
}
