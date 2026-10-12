import { spawnSync, type ChildProcess } from 'node:child_process'
import { win32 } from 'node:path'

export type ApiStopResult = 'group' | 'tree' | 'process' | 'already-stopped'

/**
 * Spawn options that let killApiProcessTree reach every descendant. On POSIX the launcher leads its
 * own process group. On Windows there are no process groups to signal; the launcher's PID is the
 * root of the tree taskkill walks, so it stays attached. pnpm is a .cmd shim there, which Node only
 * runs through a shell.
 */
export function ownedProcessOptions() {
  const windows = process.platform === 'win32'
  return { detached: !windows, shell: windows }
}

// taskkill's exit status when the PID no longer exists.
const TASKKILL_NOT_FOUND = 128

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

/**
 * Force-stop a Windows process and every descendant. taskkill finds descendants by parent PID, so
 * the launcher must still be running: a descendant whose launcher already exited is unreachable.
 */
function taskkillTree(pid: number): boolean {
  // Resolved from SystemRoot, not PATH, so a taskkill earlier on PATH is never run instead.
  const taskkill = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
  const result = spawnSync(taskkill, ['/PID', String(pid), '/T', '/F'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status === 0) return true
  if (result.status === TASKKILL_NOT_FOUND) return false
  const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim()
  throw new Error(
    `taskkill could not stop process tree ${pid} (exit status ${result.status})` +
      (detail ? `: ${detail}` : ''),
  )
}

function stopOwnedProcess(apiProcess: ChildProcess, pid: number): ApiStopResult {
  if (process.platform !== 'win32' && sendKill(-pid)) return 'group'
  // A reaped launcher must not be signaled again: its PID could have been reused.
  if (apiProcess.exitCode != null || apiProcess.signalCode != null) return 'already-stopped'
  if (process.platform === 'win32') return taskkillTree(pid) ? 'tree' : 'already-stopped'
  // process.kill reports syscall errors directly; ChildProcess.kill can instead return false.
  return sendKill(pid) ? 'process' : 'already-stopped'
}

/**
 * Stop the API process tree started by e2e setup, including pnpm and Nx descendants: the process
 * group on POSIX, the launcher's process tree on Windows.
 */
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
