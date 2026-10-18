// @ts-check
// Creates the test database a test run needs when it is missing, so a fresh checkout or worktree
// whose TEST_DATABASE_URL names a database the server does not have yet gets it instead of a failed
// run. Called by `scripts/test-db.sh ensure` (and by its `start` and `reset`), which applies the
// same rule first; this module checks it again before it connects anywhere.
//
// It only ever creates a database, never drops or alters one, and only one that is plainly a local
// test database: a postgres(ql):// URL on localhost, 127.0.0.1 or [::1] whose database name ends in
// _test, with no query string or fragment. E2E_ALLOW_NON_DISPOSABLE_DB does not widen that. It
// connects with the URL's own credentials to the server's `postgres` database (`template1` when that
// does not exist), checks pg_database, and runs CREATE DATABASE only when the name is absent.
//
// Usage: TEST_DATABASE_URL=... node scripts/test-database.mjs ensure
// The URL comes from the environment, so its password never appears in a process listing. Every
// message is scrubbed of the URL and its credentials.

import pg from 'pg'
import { pathToFileURL } from 'node:url'

// The same shape test-db.sh accepts: scheme, optional user-info, a host name or bracketed IPv6
// literal, an optional port and a plain database name, and nothing after it.
const PLAIN_URL =
  /^(postgres|postgresql):\/\/([^@/?#]*@)?([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:\d+)?\/([A-Za-z0-9_-]+)$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
// PostgreSQL truncates identifiers longer than this, so a longer name would create another database.
const MAX_IDENTIFIER_BYTES = 63
const DUPLICATE_DATABASE = '42P04'
const INVALID_CATALOG_NAME = '3D000'

/**
 * The database a URL names, when this module may create it: a local *_test database in a plain
 * postgres(ql):// URL. Throws, without echoing the URL, for anything else.
 *
 * @param {string} databaseUrl
 * @returns {{ database: string, maintenanceUrl: (database: string) => string }}
 */
export function creatableTestDatabase(databaseUrl) {
  const match = PLAIN_URL.exec(databaseUrl)
  if (!match) {
    throw new Error('not a plain postgresql:// URL (no query or fragment), so it is not created')
  }
  const [, scheme, userInfo = '', host, port = '', database] = match
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error('its host is not localhost, 127.0.0.1 or [::1], so it is not created')
  }
  if (!/_test$/i.test(database)) {
    throw new Error('its database name does not end in _test, so it is not created')
  }
  if (Buffer.byteLength(database) > MAX_IDENTIFIER_BYTES) {
    throw new Error(`its database name is longer than ${MAX_IDENTIFIER_BYTES} bytes`)
  }
  return {
    database,
    maintenanceUrl: name => `${scheme}://${userInfo}${host}${port}/${name}`,
  }
}

/**
 * Text with a database URL, its user-info and its password removed, for messages that reach
 * terminals and CI logs. Any other `scheme://user:password@` in the text loses its user-info too.
 *
 * @param {string} text
 * @param {string} databaseUrl
 * @returns {string}
 */
export function scrubCredentials(text, databaseUrl) {
  let scrubbed = text
  const secrets = [databaseUrl]
  const userInfo = /^[a-z]+:\/\/([^@/?#]*)@/i.exec(databaseUrl)?.[1]
  if (userInfo) {
    secrets.push(userInfo)
    const password = userInfo.split(':').slice(1).join(':')
    if (password) {
      secrets.push(password)
      try {
        secrets.push(decodeURIComponent(password))
      } catch {
        // Not valid percent-encoding: the raw form is already listed.
      }
    }
  }
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    scrubbed = scrubbed.split(secret).join('***')
  }
  return dropUserInfo(scrubbed)
}

/**
 * Text with the user-info of every `scheme://user:password@host` replaced by `***`. A plain scan
 * rather than a regex, so a long or malformed message cannot make it backtrack.
 *
 * @param {string} text
 * @returns {string}
 */
export function dropUserInfo(text) {
  let result = ''
  let from = 0
  let separator = text.indexOf('://')
  while (separator !== -1) {
    const start = separator + 3
    let end = start
    while (end < text.length && !'@/ \t\r\n'.includes(text[end])) end++
    const hasUserInfo = text[end] === '@' && end > start
    result += text.slice(from, start) + (hasUserInfo ? '***' : text.slice(start, end))
    from = end
    separator = text.indexOf('://', end)
  }
  return result + text.slice(from)
}

/**
 * @typedef {{ query: (text: string, values?: unknown[]) => Promise<{ rowCount: number | null }>, end: () => Promise<void> }} SqlClient
 * @typedef {(connectionString: string) => Promise<SqlClient>} Connect
 */

/** @type {Connect} */
async function connectWithPg(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 })
  await client.connect()
  return client
}

/**
 * A client on the server's maintenance database: `postgres`, or `template1` when the server has no
 * `postgres` database.
 *
 * @param {(database: string) => string} maintenanceUrl
 * @param {Connect} connect
 */
async function connectToMaintenance(maintenanceUrl, connect) {
  try {
    return await connect(maintenanceUrl('postgres'))
  } catch (error) {
    if (/** @type {{ code?: string }} */ (error)?.code !== INVALID_CATALOG_NAME) throw error
    return connect(maintenanceUrl('template1'))
  }
}

/**
 * Create the test database a URL names when the server does not have it. Resolves to `created`
 * or `exists`; rejects when the URL is not a local *_test database or the server refuses.
 *
 * @param {string} databaseUrl
 * @param {{ connect?: Connect }} [options]
 * @returns {Promise<'created' | 'exists'>}
 */
export async function ensureTestDatabase(databaseUrl, { connect = connectWithPg } = {}) {
  const { database, maintenanceUrl } = creatableTestDatabase(databaseUrl)
  const client = await connectToMaintenance(maintenanceUrl, connect)
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
    if (existing.rowCount) return 'exists'
    try {
      // The name matched [A-Za-z0-9_-]+ above, so quoting it as an identifier is exact.
      await client.query(`CREATE DATABASE "${database}"`)
      return 'created'
    } catch (error) {
      // Another run created it between the check and here.
      if (/** @type {{ code?: string }} */ (error)?.code === DUPLICATE_DATABASE) return 'exists'
      throw error
    }
  } finally {
    await client.end()
  }
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @param {{ connect?: Connect, write?: (line: string) => void, writeError?: (line: string) => void }} [io]
 * @returns {Promise<number>} the exit status
 */
export async function main(args, env, io = {}) {
  const write = io.write ?? (line => process.stdout.write(`${line}\n`))
  const writeError = io.writeError ?? (line => process.stderr.write(`${line}\n`))
  const databaseUrl = env.TEST_DATABASE_URL ?? ''
  if (args[0] !== 'ensure' || !databaseUrl) {
    writeError('Usage: TEST_DATABASE_URL=<url> node scripts/test-database.mjs ensure')
    return 2
  }
  try {
    const outcome = await ensureTestDatabase(databaseUrl, { connect: io.connect })
    const { database } = creatableTestDatabase(databaseUrl)
    write(
      outcome === 'created'
        ? `✅ Created the test database ${database}`
        : `✅ The test database ${database} exists`,
    )
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeError(`❌ Could not ensure the test database: ${scrubCredentials(message, databaseUrl)}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env)
}
