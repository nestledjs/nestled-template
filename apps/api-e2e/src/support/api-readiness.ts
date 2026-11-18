// How long global setup waits for the API it started to accept connections, and what it prints when
// the API does not. `nx serve api` builds the API with webpack before it listens; on a cold CI
// machine (no Nx cache, no webpack cache) that build alone can take longer than a minute, so the
// wait is generous by default and configurable with E2E_API_START_TIMEOUT_SECONDS.

export const DEFAULT_API_START_TIMEOUT_SECONDS = 300
export const API_OUTPUT_TAIL_LINES = 40

/**
 * The readiness budget in whole seconds: E2E_API_START_TIMEOUT_SECONDS when it is a positive whole
 * number, the default otherwise. An unusable value is reported rather than silently ignored.
 */
export function apiStartTimeoutSeconds(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): number {
  const raw = env.E2E_API_START_TIMEOUT_SECONDS?.trim()
  if (!raw) return DEFAULT_API_START_TIMEOUT_SECONDS
  if (/^\d+$/.test(raw) && Number(raw) > 0) return Number(raw)
  warn(
    `E2E_API_START_TIMEOUT_SECONDS="${raw}" is not a positive whole number of seconds; ` +
      `using ${DEFAULT_API_START_TIMEOUT_SECONDS}.`,
  )
  return DEFAULT_API_START_TIMEOUT_SECONDS
}

/** The last `count` non-empty lines of the API's output, for a readiness failure. */
export function lastOutputLines(output: string, count = API_OUTPUT_TAIL_LINES): string {
  const lines = output.split(/\r?\n/).filter(line => line.trim() !== '')
  if (lines.length === 0) return '(the API printed nothing)'
  return lines.slice(-count).join('\n')
}

/**
 * The arguments global setup runs `pnpm` with to serve the API. `@nx/js:node` starts Node's inspector
 * by default, on a fixed 9229 shared by every repo (and by a dev API you are running), so two e2e
 * runs, or an e2e run beside a debug session, collided on it. Nobody attaches to an API the harness
 * starts and stops, so the inspector is off; E2E_API_INSPECT_PORT=<port> turns it on, on that port.
 * `nx serve api` for development is unchanged.
 */
export function apiServeArgs(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): string[] {
  const serve = ['nx', 'serve', 'api']
  const raw = env.E2E_API_INSPECT_PORT?.trim()
  if (!raw) return [...serve, '--inspect=false']
  if (/^\d+$/.test(raw) && Number(raw) > 0 && Number(raw) < 65536) {
    return [...serve, '--inspect=inspect', `--port=${Number(raw)}`]
  }
  warn(`E2E_API_INSPECT_PORT="${raw}" is not a port number; serving the API without the inspector.`)
  return [...serve, '--inspect=false']
}
