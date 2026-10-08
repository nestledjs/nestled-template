import type { ChildProcess } from 'node:child_process'

export type ApiStopResult = 'group' | 'process' | 'already-stopped'

const registrations = new WeakMap<ChildProcess, () => void>()

function sendKill(pid: number): boolean {
  try {
    process.kill(pid, 'SIGKILL')
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH')
      return false
    throw error
  }
}

function stopOwnedProcess(apiProcess: ChildProcess, pid: number): ApiStopResult {
  if (process.platform !== 'win32' && sendKill(-pid)) return 'group'
  // A reaped launcher must not be signaled again: its PID could have been reused.
  if (apiProcess.exitCode != null || apiProcess.signalCode != null) return 'already-stopped'
  // process.kill reports syscall errors directly; ChildProcess.kill can instead return false.
  return sendKill(pid) ? 'process' : 'already-stopped'
}

/** Stop the API process group started by e2e setup, including pnpm and Nx descendants. */
export function killApiProcessTree(apiProcess: ChildProcess | null | undefined): ApiStopResult {
  if (!apiProcess) return 'already-stopped'
  const result = apiProcess.pid ? stopOwnedProcess(apiProcess, apiProcess.pid) : 'already-stopped'
  // Keep the exit fallback registered if signaling throws, so shutdown can retry cleanup.
  registrations.get(apiProcess)?.()
  return result
}

/** Register immediately after spawn, so cancellation during startup also cleans up the API. */
export function registerApiProcessCleanup(apiProcess: ChildProcess): () => void {
  registrations.get(apiProcess)?.()
  const attemptCleanup = () => {
    try {
      killApiProcessTree(apiProcess)
      return true
    } catch (error) {
      console.error('Failed to stop owned API process:', error)
      return false
    }
  }
  const onExit = (code: number) => {
    if (!attemptCleanup() && code === 0) process.exitCode = 1
  }
  const onInterrupt = () => {
    attemptCleanup()
    process.exit(130)
  }
  const onTerminate = () => {
    attemptCleanup()
    process.exit(143)
  }
  const unregister = () => {
    process.removeListener('exit', onExit)
    process.removeListener('SIGINT', onInterrupt)
    process.removeListener('SIGTERM', onTerminate)
    registrations.delete(apiProcess)
  }
  registrations.set(apiProcess, unregister)
  process.once('exit', onExit)
  process.once('SIGINT', onInterrupt)
  process.once('SIGTERM', onTerminate)
  return unregister
}
