import { waitForPortOpen } from '@nx/node/utils'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'

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
async function isPortInUse(port: number, host: string = 'localhost'): Promise<boolean> {
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

  // Always use TEST_DATABASE_URL for E2E tests
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5433/nestled_template_test'
  process.env.DATABASE_URL = testDatabaseUrl

  const host = process.env.HOST ?? 'localhost'
  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  const skipApiCheck = process.env.SKIP_API_CHECK === 'true'

  // Track if we started the API (so teardown knows to stop it)
  let apiProcess: ChildProcess | null = null
  globalThis.__API_PROCESS__ = null
  globalThis.__WE_STARTED_API__ = false

  if (skipApiCheck) {
    console.log('⏭️  Skipping E2E tests (SKIP_API_CHECK=true)')
    globalThis.__SKIP_E2E_TESTS__ = true
    globalThis.__TEARDOWN_MESSAGE__ = '\n✨ Tearing down E2E tests...\n'
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
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
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
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
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
    globalThis.__WE_STARTED_API__ = false
    globalThis.__SKIP_E2E_TESTS__ = false
  } else {
    // Start the API server with the test database
    console.log(`🚀 Starting API server with test database on ${host}:${port}...`)

    try {
      apiProcess = await startApiServer(projectRoot, testDatabaseUrl, port, host)

      // Store process reference for teardown
      globalThis.__API_PROCESS__ = apiProcess
      globalThis.__WE_STARTED_API__ = true
      globalThis.__SKIP_E2E_TESTS__ = false
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
  globalThis.__TEARDOWN_MESSAGE__ = '\n✨ Tearing down E2E tests...\n'

  // Register cleanup on exit to kill API if globalTeardown doesn't run
  // This is a fallback - the API should be automatically killed when test process exits
  // since we're not using detached mode
  process.on('exit', () => {
    const apiProcess = (globalThis as any).__API_PROCESS__ as ChildProcess | null
    if (apiProcess?.pid && !apiProcess.killed) {
      try {
        apiProcess.kill('SIGKILL')
      } catch {
        // Process already dead
      }
    }
  })
}
