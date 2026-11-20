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

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:'])

/** A URL's host, port and database name, without its credentials, for messages and logs. */
export function describeDatabase(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    return `${url.host}/${decodeURIComponent(url.pathname.slice(1))}`
  } catch {
    return '(an unparseable URL)'
  }
}

/**
 * Why a URL is not a disposable test database, or undefined when it is one. `overridable` says
 * whether E2E_ALLOW_NON_DISPOSABLE_DB may let it through: a remote host or another name can be a
 * deliberate choice, but a URL that could connect somewhere other than it appears to never is, and
 * neither is one on the development server (see developmentServerReason), whatever it is named.
 *
 * This is the one rule for every path that writes to, resets or drops a test database: global
 * setup's guard and its from-scratch reset both read it. `env` supplies POSTGRES_PORT.
 */
export function nonDisposableReason(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): { reason: string; overridable: boolean } | undefined {
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    return { reason: 'it is not a URL', overridable: false }
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    return { reason: `its protocol is ${url.protocol}, not postgresql:`, overridable: false }
  }
  if (databaseUrl.includes('#')) {
    return {
      reason: 'it has a fragment (#...), which clients read differently',
      overridable: false,
    }
  }
  let database: string
  try {
    database = decodeURIComponent(url.pathname.slice(1))
  } catch {
    // new URL() accepts a malformed escape (%ZZ) that decoding then rejects.
    return { reason: 'its database name is not valid percent-encoding', overridable: false }
  }
  const params = [...url.searchParams.keys()].map(key => key.toLowerCase())
  const override = params.find(key => (DESTINATION_OVERRIDES as readonly string[]).includes(key))
  if (override) {
    return {
      reason: `its ?${override}= parameter overrides where the client connects`,
      overridable: false,
    }
  }
  // Before the name and host checks: a *_test database on the development server is still on it,
  // and no opt-in makes the development data disposable.
  const developmentServer = developmentServerReason(databaseUrl, env)
  if (developmentServer) return { reason: developmentServer, overridable: false }
  if (params.includes('schema')) {
    // Prisma works in that schema, while the from-scratch reset empties public.
    return { reason: 'its ?schema= parameter moves Prisma out of public', overridable: true }
  }
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    return { reason: 'its host is not localhost, 127.0.0.1 or ::1', overridable: true }
  }
  if (!/_test$/i.test(database)) {
    return { reason: 'its database name does not end in _test', overridable: true }
  }
  return undefined
}

/**
 * Why a URL reaches this machine's development Postgres, or undefined. POSTGRES_PORT, from the
 * repo-root .env that Nx loads, is the port it listens on; a local URL on that port puts the test
 * database beside the development data, however it is named. CI sets no POSTGRES_PORT, and then
 * there is nothing to compare with.
 */
export function developmentServerReason(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const developmentPort = env.POSTGRES_PORT?.trim()
  if (!developmentPort) return undefined
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    return undefined
  }
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) return undefined
  const port = url.port || '5432'
  if (port !== developmentPort) return undefined
  return `it is on port ${port}, where the development Postgres listens (POSTGRES_PORT)`
}

/**
 * Whether a URL names a database this suite may migrate, push, seed and wipe: a postgresql: URL on
 * this machine (the rule prisma.config.ts applies to `migrate reset`), named as a test database,
 * ending in `_test` (`nestled_template_test` by default), with no `?schema=` and no fragment, and
 * not on the development server's port (POSTGRES_PORT in `env`). A URL whose query parameters
 * override the destination (`?host=`, `?port=`, `?dbname=` and the like) is never disposable, since
 * the client would connect there.
 */
export function isDisposableTestDatabase(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return nonDisposableReason(databaseUrl, env) === undefined
}

/**
 * Refuse a test database that is not disposable before global setup resets, migrates, pushes or
 * seeds it. (The wrapper's read-only `SELECT 1` probe may already have connected; nothing is
 * written before this check.) A TEST_DATABASE_URL copied from DATABASE_URL, or one pointing at a
 * shared host, would otherwise have its schema rewritten and its data seeded over.
 *
 * `E2E_ALLOW_NON_DISPOSABLE_DB=1` is the opt-out for a database you know is disposable under another
 * name or host (a CI service container reached by its service name, for example). It never lets
 * through a URL that could connect elsewhere (a destination override, a fragment, another
 * protocol) or one on the development server, and the from-scratch reset still requires a
 * disposable database. So in a setup that empties the schema on every run, the opt-out changes
 * nothing: such a setup should not offer it.
 */
export function assertDisposableTestDatabase(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): 'disposable' | 'allowed' {
  const problem = nonDisposableReason(databaseUrl, env)
  if (!problem) return 'disposable'
  if (problem.overridable && env[ALLOW_NON_DISPOSABLE_DB] === '1') return 'allowed'
  throw new Error(
    [
      `Refusing to run e2e setup against ${describeDatabase(databaseUrl)}: ${problem.reason}.`,
      `Setup resets, migrates, pushes the schema to and seeds the test database, so it must be`,
      `disposable: a postgresql: URL on this machine (localhost, 127.0.0.1 or ::1), named *_test,`,
      `with no query parameter that changes where it connects, and not on the development server.`,
      ``,
      problem.overridable
        ? `Point TEST_DATABASE_URL at a disposable database, or, if this one is disposable under ` +
          `another name, host or server, say so explicitly:  ${ALLOW_NON_DISPOSABLE_DB}=1`
        : `Point TEST_DATABASE_URL at a disposable database. ${ALLOW_NON_DISPOSABLE_DB} does not ` +
          `apply to a URL on the development server or one that could connect somewhere other ` +
          `than it appears to.`,
    ].join('\n'),
  )
}

export type DatabaseProbe = 'pg' | 'psql'

/**
 * The client global setup uses for its own SQL: the `SELECT 1` probe and the from-scratch reset.
 * `pg` (the default) is the suite's pg runner and needs no psql binary. `E2E_DATABASE_PROBE=psql`
 * runs psql from PATH instead, for a repo whose own lifecycle tests stand in for the database with
 * a stub psql.
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

/** How global setup reaches the database: the pg runner, or psql given its args and environment. */
export interface DatabaseClients {
  pg: (databaseUrl: string, statement: string, timeout?: number) => void
  psql: (
    args: string[],
    env: NodeJS.ProcessEnv,
    timeout?: number,
  ) => { status: number | null; stderr?: string | null }
}

// psql's error output, quoted in the error so a failure says why (a refused connection, a failed
// login, the statement's own error). Capped, since a failing script can print a great deal.
const PSQL_STDERR_LIMIT = 2000

function psqlFailureDetail(stderr: string | null | undefined): string {
  const text = stderr?.trim()
  if (!text) return ''
  const shown = text.length > PSQL_STDERR_LIMIT ? `${text.slice(0, PSQL_STDERR_LIMIT)}…` : text
  return `:\n${shown}`
}

/**
 * Run a statement on the test database with the client E2E_DATABASE_PROBE selects (see
 * databaseProbe). psql gets the URL through its environment, stops at the first error, and reads
 * no ~/.psqlrc. Throws when the statement fails, with psql's error output when it gave any (the
 * psql client must capture stderr for that; libpq never prints the password).
 */
export function runOnTestDatabase(
  databaseUrl: string,
  statement: string,
  clients: DatabaseClients,
  options: { env?: NodeJS.ProcessEnv; timeout?: number } = {},
): void {
  const env = options.env ?? process.env
  if (databaseProbe(env) === 'pg') {
    clients.pg(databaseUrl, statement, options.timeout)
    return
  }
  const result = clients.psql(
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement],
    psqlProcessEnvironment(databaseUrl, env),
    options.timeout,
  )
  if (result.status !== 0) {
    throw new Error(
      `psql failed against ${describeDatabase(databaseUrl)} (exit ${result.status ?? 'signal'})` +
        psqlFailureDetail(result.stderr),
    )
  }
}

/**
 * Empty the test database's schema, so migrations can build it from scratch (global setup's P3005
 * recovery). Only for a disposable database by nonDisposableReason, the rule global setup's guard
 * applies: local, named *_test, not on the development server. Anything else is refused before any
 * SQL runs, whatever E2E_ALLOW_NON_DISPOSABLE_DB says.
 */
export function resetTestDatabase(
  databaseUrl: string,
  clients: DatabaseClients,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const problem = nonDisposableReason(databaseUrl, env)
  if (problem) {
    throw new Error(
      `Refusing to reset ${describeDatabase(databaseUrl)}: ${problem.reason}. Only a local ` +
        `database named *_test (e.g. nestled_template_test), not on the development server, is ` +
        `reset by the e2e setup, ${ALLOW_NON_DISPOSABLE_DB} or not.`,
    )
  }
  runOnTestDatabase(
    databaseUrl,
    'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
    clients,
    { env },
  )
}
