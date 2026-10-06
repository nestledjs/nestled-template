import type { ChildProcess } from 'node:child_process'

/**
 * Stop the API the e2e setup started, with everything it spawned.
 *
 * The setup runs `pnpm nx serve api`, so the API is a grandchild of the process it holds. Killing
 * only that process leaves `nx serve` and the API running, still listening on the e2e port, and the
 * next run then refuses to start. The setup spawns it as the leader of its own process group, so
 * the whole group is killed here.
 */
export function killApiProcessTree(apiProcess: ChildProcess | null | undefined): void {
  if (!apiProcess?.pid) return
  if (process.platform !== 'win32') {
    try {
      process.kill(-apiProcess.pid, 'SIGKILL')
      return
    } catch {
      // No such group (already gone, or not spawned detached): fall back to the process itself.
    }
  }
  try {
    apiProcess.kill('SIGKILL')
  } catch {
    // Process already dead
  }
}
