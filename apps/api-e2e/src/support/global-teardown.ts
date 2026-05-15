import type { ChildProcess } from 'node:child_process'

module.exports = async function () {
  // Put clean up logic here (e.g. stopping services, docker-compose, etc.).
  // Hint: `globalThis` is shared between setup and teardown.
  console.log(globalThis.__TEARDOWN_MESSAGE__ || '\n✨ Tearing down E2E tests...\n')

  // If we started the API server, stop it
  const weStartedApi = (globalThis as any).__WE_STARTED_API__
  const apiProcess = (globalThis as any).__API_PROCESS__ as ChildProcess | null

  if (weStartedApi && apiProcess?.pid) {
    console.log('🛑 Stopping API server aggressively...')
    try {
      // Clean up stdio streams first to prevent hanging
      try {
        apiProcess.stdout?.removeAllListeners()
        apiProcess.stderr?.removeAllListeners()
        apiProcess.stdout?.destroy()
        apiProcess.stderr?.destroy()
      } catch {
        // Ignore stream cleanup errors
      }

      // Kill the API server process
      try {
        apiProcess.kill('SIGKILL')
        console.log(`   Killed API server process ${apiProcess.pid}`)
      } catch (err) {
        console.log(`   Process ${apiProcess.pid} may already be dead`)
      }

      // Brief wait for kill to complete
      await new Promise(resolve => setTimeout(resolve, 100))

      console.log('✅ API server stopped')
    } catch (error) {
      console.warn('⚠️  Error stopping API server:', error)
      // Don't throw - we want tests to complete even if cleanup fails
    }
  } else if (!weStartedApi) {
    console.log('ℹ️  API server was already running - leaving it running')
  }

  console.log('✅ E2E test teardown complete')

  // Note: Vitest 3.x will handle process exit automatically
  // We don't need to call process.exit() - it will cause errors

  // Log active handles for debugging (only in CI or if DEBUG env var is set)
  if (process.env.CI || process.env.DEBUG_HANDLES) {
    console.log('\n🔍 Active handles:')
    const handles = (process as any)._getActiveHandles?.() || []
    const requests = (process as any)._getActiveRequests?.() || []
    console.log(`   Handles: ${handles.length}, Requests: ${requests.length}`)
    if (handles.length > 0) {
      handles.forEach((h: any, i: number) => {
        console.log(`   Handle ${i}: ${h.constructor?.name || 'unknown'}`)
      })
    }
  }
}
