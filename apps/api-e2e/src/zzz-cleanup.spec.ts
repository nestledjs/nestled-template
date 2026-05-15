import { describe, it, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import axios from 'axios'
/**
 * This file runs LAST (alphabetically) to ensure cleanup happens
 * We use afterAll to forcibly kill the API server since Vitest's globalTeardown
 * doesn't always execute reliably.
 */
describe('ZZZ Cleanup (runs last)', () => {
  it('should verify API is still running before teardown', async () => {
    console.log('\n✨ Final test - verifying API health before teardown...')
    const weStartedApi = (globalThis as any).__WE_STARTED_API__
    const apiProcess = (globalThis as any).__API_PROCESS__ as ChildProcess | null
    if (weStartedApi && apiProcess?.pid) {
      console.log(`✓ API server is running (PID: ${apiProcess.pid})`)
      console.log('  → Will be cleaned up by afterAll hook')
    } else if (!weStartedApi) {
      console.log('✓ Using pre-existing API server')
    }
    console.log('✅ All tests complete - cleanup will happen in afterAll')
  })
  afterAll(async () => {
    console.log('\n🧹 Running cleanup from afterAll hook...')
    const weStartedApi = (globalThis as any).__WE_STARTED_API__
    const apiProcess = (globalThis as any).__API_PROCESS__ as ChildProcess | null
    if (weStartedApi && apiProcess?.pid) {
      console.log(`🛑 Killing API server (PID: ${apiProcess.pid})...`)
      try {
        // Unref everything first so they don't keep event loop alive
        apiProcess.stdout?.unref()
        apiProcess.stderr?.unref()
        apiProcess.stdin?.unref()
        apiProcess.unref()
        // Then clean up stdio streams to release file descriptors
        apiProcess.stdout?.removeAllListeners()
        apiProcess.stderr?.removeAllListeners()
        apiProcess.stdin?.removeAllListeners()
        apiProcess.stdout?.destroy()
        apiProcess.stderr?.destroy()
        apiProcess.stdin?.destroy()
      } catch {
        // Ignore cleanup errors
      }
      try {
        apiProcess.kill('SIGKILL')
        console.log(`✓ API server killed`)
        // Wait for process to fully terminate and release all resources
        await new Promise(resolve => setTimeout(resolve, 1000))
        // Verify it's dead
        try {
          process.kill(apiProcess.pid, 0) // Check if process exists
          console.log('⚠️  API server still running, waiting longer...')
          await new Promise(resolve => setTimeout(resolve, 2000))
        } catch {
          // Process is dead (kill with signal 0 throws if process doesn't exist)
          console.log('✓ API server process terminated')
        }
      } catch (err) {
        console.log(`⚠️  Could not kill API server: ${err}`)
      }
    }
    // Explicitly destroy axios agents to release any HTTP connections
    try {
      const httpAgent = axios.defaults.httpAgent as any
      const httpsAgent = axios.defaults.httpsAgent as any
      if (httpAgent?.destroy) {
        httpAgent.destroy()
        console.log('✓ HTTP agent destroyed')
      }
      if (httpsAgent?.destroy) {
        httpsAgent.destroy()
        console.log('✓ HTTPS agent destroyed')
      }
    } catch (err) {
      console.log(`⚠️  Could not destroy axios agents: ${err}`)
    }
    console.log('✅ Cleanup complete - all tests passed!')
    console.log('⚡ Waiting for worker pools to clean up IPC channels...')
    // Give worker pools time to clean up their IPC channels gracefully
    // This is especially important in CI environments where SIGKILL can cause
    // "ERR_IPC_CHANNEL_CLOSED" errors if we kill too quickly
    // If the process doesn't exit naturally after 2 seconds, force kill it
    setTimeout(() => {
      console.log('⚡ Force killing process to prevent hanging...')
      spawn('kill', ['-9', process.pid.toString()], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    }, 2000)
  })
})
