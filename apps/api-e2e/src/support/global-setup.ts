import { waitForPortOpen } from '@nx/node/utils'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'

type E2EGlobalState = typeof globalThis & {
  __API_PROCESS__?: ChildProcess | null
  __WE_STARTED_API__?: boolean
  __SKIP_E2E_TESTS__?: boolean
  __TEARDOWN_MESSAGE__?: string
}

const e2eGlobal = globalThis as E2EGlobalState

/**
 * Check if database is accessible
 */
async function isDatabaseAccessible(databaseUrl: string): Promise<boolean> {
  try {
    // Parse the URL to extract credentials for direct psql test
    const url = new URL(databaseUrl)
    const username = url.username || 'prisma'
    const password = url.password || 'prisma'
    const host = url.hostname || 'localhost'
    const port = url.port || '5432'
    const database = url.pathname.slice(1) // Remove leading slash

    execSync(`psql -U ${username} -h ${host} -p ${port} -d ${database} -c "SELECT 1"`, {
      env: { ...process.env, PGPASSWORD: password },
      stdio: 'pipe',
      timeout: 2000,
    })
    return true
  } catch {
    return false
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
      // test DB and the served API would talk to the dev database. Pin both to the test URL (#117).
      DIRECT_URL: testDatabaseUrl,
      PORT: port.toString(),
      HOST: host,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

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
  apiProcess.stdout?.unref()
  apiProcess.stderr?.unref()

  console.log(`⏳ Waiting for API to start...`)
  try {
    await waitForPortOpen(port, { host, timeout: 45000 })
  } catch (portError) {
    console.error('❌ API server did not start within timeout')
    console.error('Last output from API server:')
    console.error(startupOutput.slice(-1000))
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

  // Always use TEST_DATABASE_URL for E2E tests
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5433/nestled_template_test'
  process.env.DATABASE_URL = testDatabaseUrl
  // prisma.config.ts prefers DIRECT_URL — pin it too, or db push / seed below (and any Prisma call)
  // could run against the dev database instead of the isolated test DB (#117).
  process.env.DIRECT_URL = testDatabaseUrl

  const host = process.env.HOST ?? 'localhost'
  // E2E's own port, not the normal PORT from .env — a running dev API on that port would otherwise
  // make waitForPortOpen false-pass and the harness attach to the wrong server (#118).
  const port = process.env.E2E_API_PORT ? Number(process.env.E2E_API_PORT) : 3100
  const skipApiCheck = process.env.SKIP_API_CHECK === 'true'

  // Track if we started the API (so teardown knows to stop it)
  let apiProcess: ChildProcess | null = null
  e2eGlobal.__API_PROCESS__ = null
  e2eGlobal.__WE_STARTED_API__ = false

  if (skipApiCheck) {
    console.log('⏭️  Skipping E2E tests (SKIP_API_CHECK=true)')
    e2eGlobal.__SKIP_E2E_TESTS__ = true
    e2eGlobal.__TEARDOWN_MESSAGE__ = '\n✨ Tearing down E2E tests...\n'
    return
  }

  console.log(`📊 Using test database: ${testDatabaseUrl}`)

  // Check if database is accessible
  const dbAccessible = await isDatabaseAccessible(testDatabaseUrl)

  if (!dbAccessible) {
    console.error('❌ Test database is not accessible')
    console.error('   Please ensure PostgreSQL is running and the test database exists')
    console.error(`   Database URL: ${testDatabaseUrl}`)
    throw new Error('Test database not accessible')
  }

  // Use the workspace root which should be the current working directory
  const projectRoot = process.cwd()

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
    console.log(`⚠️  API is already running on ${host}:${port}`)
    console.log("   Using existing API server (make sure it's using the test database!)")
    e2eGlobal.__WE_STARTED_API__ = false
    e2eGlobal.__SKIP_E2E_TESTS__ = false
  } else {
    // Start the API server with the test database
    console.log(`🚀 Starting API server with test database on ${host}:${port}...`)

    try {
      apiProcess = await startApiServer(projectRoot, testDatabaseUrl, port, host)

      // Store process reference for teardown
      e2eGlobal.__API_PROCESS__ = apiProcess
      e2eGlobal.__WE_STARTED_API__ = true
      e2eGlobal.__SKIP_E2E_TESTS__ = false
    } catch (error) {
      console.error('❌ Failed to start API server')
      try {
        apiProcess?.kill('SIGKILL')
      } catch {
        // Process already dead
      }
      throw error
    }
  }

  // Hint: Use `globalThis` to pass variables to global teardown.
  e2eGlobal.__TEARDOWN_MESSAGE__ = '\n✨ Tearing down E2E tests...\n'

  // Register cleanup on exit to kill API if globalTeardown doesn't run
  // This is a fallback - the API should be automatically killed when test process exits
  // since we're not using detached mode
  process.on('exit', () => {
    const apiProcess = e2eGlobal.__API_PROCESS__
    if (apiProcess?.pid && !apiProcess.killed) {
      try {
        apiProcess.kill('SIGKILL')
      } catch {
        // Process already dead
      }
    }
  })
}
