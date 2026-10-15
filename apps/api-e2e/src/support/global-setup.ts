import { waitForPortOpen } from '@nx/node/utils'
import { execSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createConnection, type Socket } from 'node:net'
import { killApiProcessTree, ownedProcessOptions, registerApiProcessCleanup } from './api-process'
import {
  ALLOW_NON_DISPOSABLE_DB,
  assertDisposableTestDatabase,
  describeDatabase,
  isDisposableTestDatabase,
  runOnTestDatabase,
  type DatabaseClients,
} from './database-guards'
import globalTeardown from './global-teardown'
import { runSql, testDatabaseUrl } from './test-db'

type E2EGlobalState = typeof globalThis & {
  __API_PROCESS__?: ChildProcess | null
  __WE_STARTED_API__?: boolean
  __TEARDOWN_MESSAGE__?: string
}

const e2eGlobal = globalThis as E2EGlobalState

// The clients global setup's own SQL runs through; E2E_DATABASE_PROBE picks one (see databaseProbe).
const databaseClients: DatabaseClients = {
  pg: (databaseUrl, statement, timeout) => {
    runSql(databaseUrl, statement, {}, timeout)
  },
  // stderr is captured so a failure reports psql's own error; stdout is not needed.
  psql: (args, env, timeout) =>
    spawnSync('psql', args, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf8',
      timeout,
    }),
}

/**
 * Check that the database answers `SELECT 1`, with the client E2E_DATABASE_PROBE selects. Returns
 * undefined when it does, else the client's error, so the failure says why.
 */
function databaseAccessError(databaseUrl: string): string | undefined {
  try {
    runOnTestDatabase(databaseUrl, 'SELECT 1', databaseClients, { timeout: 10000 })
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * Check if a port is already in use
 */
async function isPortInUse(port: number, host = 'localhost'): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ port, host, timeout: 100 })

    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })

    socket.on('error', () => {
      resolve(false)
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function runMigrateDeploy(projectRoot: string, testDatabaseUrl: string) {
  const result = spawnSync('pnpm', ['prisma', 'migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
    encoding: 'utf8',
    // pnpm is a .cmd shim on Windows, which Node only runs through a shell.
    shell: process.platform === 'win32',
  })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/**
 * Empty the test database's schema, so migrations can build it from scratch. Only for a disposable
 * database (local, named *_test); anything else is refused before the reset runs, whatever
 * E2E_ALLOW_NON_DISPOSABLE_DB says.
 */
function resetTestDatabase(testDatabaseUrl: string) {
  if (!isDisposableTestDatabase(testDatabaseUrl)) {
    throw new Error(
      `Refusing to reset ${describeDatabase(testDatabaseUrl)}: only a local database named *_test ` +
        `(e.g. nestled_template_test) is reset by the e2e setup, ${ALLOW_NON_DISPOSABLE_DB} or not.`,
    )
  }
  runOnTestDatabase(
    testDatabaseUrl,
    'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
    databaseClients,
  )
}

/**
 * Apply committed migrations to the test database.
 *
 * A test database built before the suite applied migrations (by `prisma db push` alone) has tables
 * but no migration history, and `migrate deploy` refuses it with P3005 ("the database schema is not
 * empty"). The test database is disposable: empty it and apply the migrations from scratch. A fresh
 * database (CI) and one that already has migration history are migrated as they are.
 */
function applyMigrations(projectRoot: string, testDatabaseUrl: string) {
  const first = runMigrateDeploy(projectRoot, testDatabaseUrl)
  if (first.ok) return

  if (!first.output.includes('P3005')) {
    console.error('❌ Failed to apply migrations')
    throw new Error('prisma migrate deploy failed against the test database')
  }

  console.log(
    '♻️  The test database has tables but no migration history (it was built with `db push`).',
  )
  console.log('   Resetting the test database and applying migrations from scratch...')
  resetTestDatabase(testDatabaseUrl)

  const retry = runMigrateDeploy(projectRoot, testDatabaseUrl)
  if (!retry.ok) {
    console.error('❌ Failed to apply migrations after resetting the test database')
    throw new Error('prisma migrate deploy failed against the reset test database')
  }
}

async function startApiServer(
  projectRoot: string,
  testDatabaseUrl: string,
  port: number,
  host: string,
): Promise<ChildProcess> {
  const apiProcess = spawn('pnpm', ['nx', 'serve', 'api'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      // prisma.config.ts prefers DIRECT_URL || DATABASE_URL, so a repo .env DIRECT_URL would beat the
      // test DB and the served API would talk to the dev database. Pin both to the test URL.
      DIRECT_URL: testDatabaseUrl,
      PORT: port.toString(),
      HOST: host,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // So teardown can stop `nx serve` and the API it starts, not just pnpm.
    ...ownedProcessOptions(),
  })

  registerApiProcessCleanup(apiProcess)

  let startupOutput = ''
  apiProcess.stdout?.on('data', data => {
    const text = data.toString()
    startupOutput += text
    if (
      text.includes('Nest application successfully started') ||
      text.includes('listening on') ||
      text.includes('Application is running')
    ) {
      console.log('   ' + text.trim())
    }
  })

  apiProcess.stderr?.on('data', data => {
    const text = data.toString()
    startupOutput += text
    if (text.includes('Error') || text.includes('error')) {
      console.error('   ⚠️  ' + text.trim())
    }
  })

  apiProcess.unref()
  // Piped stdio streams are sockets at runtime; ChildProcess types them as plain Readable.
  ;(apiProcess.stdout as Socket | null)?.unref()
  ;(apiProcess.stderr as Socket | null)?.unref()

  console.log(`⏳ Waiting for API to start...`)
  try {
    // waitForPortOpen has no `timeout` option; it retries. A `timeout: 45000` here was ignored, so
    // the wait was always the 120 x 1s default — keep that proven budget and state it.
    await waitForPortOpen(port, { host, retries: 120, retryDelay: 1000 })
  } catch (portError) {
    console.error('❌ API server did not start within timeout')
    console.error('Last output from API server:')
    console.error(startupOutput.slice(-1000))
    killApiProcessTree(apiProcess)
    throw portError
  }

  await new Promise(resolve => setTimeout(resolve, 2000))
  console.log('✅ API server started and ready!')
  return apiProcess
}

module.exports = async function globalSetup() {
  // Start services that the app needs to run (e.g. database, docker-compose, etc.).
  console.log('\n🚀 Setting up E2E tests...\n')

  // Set test environment variables
  process.env.NODE_ENV = 'test'

  // Disable the signup abuse gate for E2E. The gate keys off NODE_ENV to turn its throttle/MX checks
  // off under test, but a production webpack build inlines process.env.NODE_ENV to "production", so
  // a clone that serves the built dist (rather than `nx serve`) never sees NODE_ENV=test and the
  // 3/hour throttle then fails every spec that registers >3 users. These keys are read at runtime
  // (not inlined), so setting them here restores the intended test config regardless of how the API
  // is served. Forced (not defaulted) so a stray SIGNUP_THROTTLE_ENABLED=true in a dev shell or CI
  // cannot silently reintroduce the failure — E2E always runs with the gate off, deterministically.
  // Leave SIGNUP_BLOCK_DISPOSABLE at its default (on in every env, including test).
  process.env.SIGNUP_THROTTLE_ENABLED = 'false'
  process.env.SIGNUP_REQUIRE_MX = 'false'

  // Always use the test database (TEST_DATABASE_URL, or what scripts/test-db.sh resolves from .env)
  process.env.DATABASE_URL = testDatabaseUrl
  // prisma.config.ts prefers DIRECT_URL — pin it too, or db push / seed below (and any Prisma call)
  // could run against the dev database instead of the isolated test DB.
  process.env.DIRECT_URL = testDatabaseUrl

  const host = process.env.HOST ?? 'localhost'
  // E2E's own port, not the normal PORT from .env — a running dev API on that port would otherwise
  // make waitForPortOpen false-pass and the harness attach to the wrong server.
  const port = process.env.E2E_API_PORT ? Number(process.env.E2E_API_PORT) : 3100

  // Track if we started the API (so teardown knows to stop it)
  let apiProcess: ChildProcess | null = null
  e2eGlobal.__API_PROCESS__ = null
  e2eGlobal.__WE_STARTED_API__ = false

  console.log(`📊 Using test database: ${describeDatabase(testDatabaseUrl)}`)

  // Before anything writes to it: setup resets, migrates, pushes and seeds this database.
  if (assertDisposableTestDatabase(testDatabaseUrl) === 'allowed') {
    console.log(
      `⚠️  ${ALLOW_NON_DISPOSABLE_DB}=1: running setup against a database that does not look ` +
        'disposable. A from-scratch reset, if migrations need one, is still refused.',
    )
  }

  // Check if database is accessible
  const accessError = databaseAccessError(testDatabaseUrl)

  if (accessError !== undefined) {
    console.error('❌ Test database is not accessible')
    console.error('   Please ensure PostgreSQL is running and the test database exists')
    console.error(`   Database: ${describeDatabase(testDatabaseUrl)}`)
    console.error(`   ${accessError.replaceAll('\n', '\n   ')}`)
    throw new Error('Test database not accessible')
  }

  // Use the workspace root which should be the current working directory
  const projectRoot = process.cwd()

  // Apply migrations first: some of them carry database objects Prisma's schema can't describe
  // (triggers), which `db push` alone never creates. `db push` then reconciles anything newer.
  console.log('🔄 Applying migrations...')
  applyMigrations(projectRoot, testDatabaseUrl)
  console.log('✅ Migrations applied')

  // Ensure database schema is up to date
  console.log('🔄 Syncing database schema...')
  try {
    execSync('pnpm prisma db push', {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
      stdio: 'inherit',
    })
    console.log('✅ Database schema synced')
  } catch (error) {
    console.error('❌ Failed to sync database schema')
    throw error
  }

  // Seed database with required data (permissions, countries, etc.)
  console.log('🌱 Seeding test database...')
  try {
    execSync('pnpm prisma:seed', {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
      stdio: 'inherit',
    })
    console.log('✅ Database seeded')
  } catch (error) {
    console.error('❌ Failed to seed database')
    throw error
  }

  // Check if API is already running
  const apiAlreadyRunning = await isPortInUse(port, host)

  if (apiAlreadyRunning) {
    // Refuse by default. Adopting whatever is listening and printing "make sure it's using the
    // test database!" is an instruction to a human, in a place no human reads during CI, about a
    // fact the suite cannot verify.
    //
    // E2E_API_PORT already moved this harness off the dev port, so the collision is rare here. It
    // is not rare downstream: a repo still on the older global-setup reads PORT (dev) rather than
    // E2E_API_PORT, adopts the dev server, seeds the TEST database and runs every spec against DEV.
    // A downstream project hit exactly that. Port isolation makes the collision unlikely; refusing makes it
    // impossible to lose the evidence when it happens anyway.
    if (process.env.E2E_ALLOW_EXISTING_API !== '1') {
      throw new Error(
        [
          `Refusing to run e2e against an API this suite did not start.`,
          `Something is already listening on ${host}:${port}.`,
          ``,
          `This suite cannot check which database that process is using. If it is the dev server,`,
          `every spec runs against dev data.`,
          ``,
          `Do one of:`,
          `  - stop whatever is on ${port}`,
          `  - run e2e on another port:  E2E_API_PORT=3101 pnpm test:e2e`,
          `  - if you started that API yourself against the TEST database, say so explicitly:`,
          `      E2E_ALLOW_EXISTING_API=1 pnpm test:e2e`,
        ].join('\n'),
      )
    }
    console.log(`⚠️  Using an API this suite did not start, on ${host}:${port}`)
    console.log(
      '   E2E_ALLOW_EXISTING_API=1 was set — you have asserted it uses the test database.',
    )
    e2eGlobal.__WE_STARTED_API__ = false
  } else {
    // Start the API server with the test database
    console.log(`🚀 Starting API server with test database on ${host}:${port}...`)

    try {
      apiProcess = await startApiServer(projectRoot, testDatabaseUrl, port, host)

      // Store process reference for teardown
      e2eGlobal.__API_PROCESS__ = apiProcess
      e2eGlobal.__WE_STARTED_API__ = true
    } catch (error) {
      console.error('❌ Failed to start API server')
      killApiProcessTree(apiProcess)
      throw error
    }
  }

  // Hint: Use `globalThis` to pass variables to global teardown.
  e2eGlobal.__TEARDOWN_MESSAGE__ = '\n✨ Tearing down E2E tests...\n'
  return globalTeardown
}
