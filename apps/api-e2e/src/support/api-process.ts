import type { ChildProcess } from 'node:child_process'

export type ApiStopResult = 'group' | 'process' | 'already-stopped'

const registrations = new WeakMap<ChildProcess, () => void>()

/** Stop the API process group started by e2e setup, including pnpm and Nx descendants. */
export function killApiProcessTree(apiProcess: ChildProcess | null | undefined): ApiStopResult {
  if (!apiProcess) return 'already-stopped'
  registrations.get(apiProcess)?.()
  if (!apiProcess.pid) return 'already-stopped'
  if (process.platform !== 'win32') {
    try {
      process.kill(-apiProcess.pid, 'SIGKILL')
      return 'group'
    } catch {
      // No group (already gone, or not spawned detached): try the process itself.
    }
  }
  try {
    return apiProcess.kill('SIGKILL') ? 'process' : 'already-stopped'
  } catch {
    return 'already-stopped'
  }
}

/** Register immediately after spawn, so cancellation during startup also cleans up the API. */
export function registerApiProcessCleanup(apiProcess: ChildProcess): () => void {
  registrations.get(apiProcess)?.()
  const onExit = () => {
    killApiProcessTree(apiProcess)
  }
  const onInterrupt = () => {
    killApiProcessTree(apiProcess)
    process.exit(130)
  }
  const onTerminate = () => {
    killApiProcessTree(apiProcess)
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
