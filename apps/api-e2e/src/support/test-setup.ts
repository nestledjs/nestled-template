import axios from 'axios'
import { beforeEach } from 'vitest'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'

type E2EGlobalState = typeof globalThis & {
  __AXIOS_AGENT_CLEANUP_REGISTERED__?: boolean
  __SKIP_E2E_TESTS__?: boolean
}

const e2eGlobal = globalThis as E2EGlobalState

// Configure axios for tests to use.
const host = process.env.HOST ?? 'localhost'
// E2E has its own port namespace so a running dev API on the normal PORT can't make the client
// attach to the wrong server (fleet-upstream #118). Must match global-setup's choice.
const port = process.env.E2E_API_PORT ?? '3100'
axios.defaults.baseURL = `http://${host}:${port}`

// Create agents that don't keep connections alive
// This prevents axios from holding the event loop open after tests complete
const httpAgent = new HttpAgent({
  keepAlive: false,
  maxSockets: 10,
  timeout: 10000,
})
const httpsAgent = new HttpsAgent({
  keepAlive: false,
  maxSockets: 10,
  timeout: 10000,
})

axios.defaults.httpAgent = httpAgent
axios.defaults.httpsAgent = httpsAgent

// Destroy agents when the vitest process exits to avoid dangling handles
if (!e2eGlobal.__AXIOS_AGENT_CLEANUP_REGISTERED__) {
  e2eGlobal.__AXIOS_AGENT_CLEANUP_REGISTERED__ = true
  process.once('exit', () => {
    httpAgent.destroy()
    httpsAgent.destroy()
  })
}

// Global test configuration
process.env.NODE_ENV = 'test'

// Use TEST_DATABASE_URL - do NOT override to dev database!
// The API server will be started with this database URL by global-setup
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/nestled_template_test'
console.log(`Test setup: axios base URL set to ${axios.defaults.baseURL}`)
console.log(`Test setup: Using TEST database - ${testDatabaseUrl}`)

// Skip tests if API is not available (set by global-setup)
const shouldSkipE2E = e2eGlobal.__SKIP_E2E_TESTS__
if (shouldSkipE2E) {
  console.log('⚠️  E2E tests will be skipped (API not available)')

  // Skip all tests in this suite
  beforeEach(ctx => {
    ctx.skip()
  })
}
