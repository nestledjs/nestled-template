import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Whether the browser can reach the API, and the "API unavailable" screen's lifecycle.
 *
 * A failed request is only a report. Before the screen goes up the API is probed a few times over
 * a few seconds, so one dropped request, or a request made the instant a laptop wakes and before
 * Wi-Fi reconnects, does not take the app down. While the screen is up the API is probed with
 * backoff, and at once when the browser comes back online or the tab becomes visible again; the
 * first probe that gets an answer clears the screen without the user doing anything.
 */

/** Probe delays before the screen goes up: one now, then two more over about three seconds. */
export const CONFIRM_DELAYS_MS: readonly number[] = [0, 1500, 1500]
const RETRY_BASE_MS = 2000
const RETRY_CAP_MS = 30000
const PROBE_TIMEOUT_MS = 5000

/** Proxies return these while the API process restarts; anything else means the API answered. */
const GATEWAY_UNAVAILABLE_STATUSES = new Set([502, 503, 504])

export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS)
}

/**
 * The API's public liveness route (ApiCoreFeatureController's `GET /api/uptime`). It needs no
 * session and the API's CORS policy covers it like every other route.
 */
export function apiProbeUrl(): string {
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/api/uptime`
}

/**
 * True when the API answered at all. Any HTTP response counts, 4xx included (a project that
 * removed the uptime route still gets a 404 from a running API), except a proxy's 502/503/504. A
 * rejected fetch (offline, DNS, refused, CORS-less proxy error page) or a timeout is "unreachable".
 */
export async function probeApi(
  url: string = apiProbeUrl(),
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller?.signal,
    })
    return !GATEWAY_UNAVAILABLE_STATUSES.has(response.status)
  } catch {
    return false
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const RECOVERY_RELOAD_KEY = 'nestled:api-recovery-reload'
const RECOVERY_RELOAD_WINDOW_MS = 60000

/**
 * Reload the page because the API is reachable again, at most once a minute per tab. Without the
 * limit, a page that fails again straight after the reload (the server cannot reach the API even
 * though the browser can, or a misclassified error) would reload every few seconds. Returns false
 * when the reload was held back.
 */
export function reloadForRecovery(now: number = Date.now()): boolean {
  try {
    const last = Number(globalThis.sessionStorage?.getItem(RECOVERY_RELOAD_KEY))
    if (last && now - last < RECOVERY_RELOAD_WINDOW_MS) return false
    globalThis.sessionStorage?.setItem(RECOVERY_RELOAD_KEY, String(now))
  } catch {
    // Storage blocked: reload anyway rather than leave the screen up.
  }
  globalThis.location.reload()
  return true
}

export function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

type Phase = 'available' | 'confirming' | 'unavailable'

export interface ApiAvailabilityOptions {
  /** Called once each time the API answers again after the screen was up. */
  onRecover?: () => void
  /** Replaces the network probe (tests). */
  probe?: () => Promise<boolean>
  /** Mount with the screen already up, e.g. in an error boundary that caught a network error. */
  initiallyUnavailable?: boolean
}

export interface ApiAvailability {
  /** The screen should be shown. False while a report is still being confirmed. */
  unavailable: boolean
  /** The browser says it has no network connection. */
  offline: boolean
  /** A request failed without reaching the API: confirm it, and show the screen if it holds. */
  reportConnectivityError: () => void
  /** Show the screen without confirming (the server already found the API unreachable). */
  markUnavailable: () => void
  /** Probe now, e.g. from the screen's button. */
  retryNow: () => void
}

export function useApiAvailability(options: ApiAvailabilityOptions = {}): ApiAvailability {
  const [phase, setPhaseState] = useState<Phase>(
    options.initiallyUnavailable ? 'unavailable' : 'available',
  )
  const [offline, setOffline] = useState(false)

  const phaseRef = useRef<Phase>(phase)
  const confirmAttemptRef = useRef(0)
  const retryAttemptRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const probingRef = useRef(false)
  const mountedRef = useRef(true)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  // runProbe and schedule call each other; the ref breaks the cycle without a stale closure.
  const runProbeRef = useRef<() => void>(() => undefined)

  const schedule = useCallback(
    (delayMs: number) => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined
        runProbeRef.current()
      }, delayMs)
    },
    [clearTimer],
  )

  const scheduleRetry = useCallback(() => {
    schedule(retryDelayMs(retryAttemptRef.current))
    retryAttemptRef.current += 1
  }, [schedule])

  const runProbe = useCallback(async () => {
    if (probingRef.current || phaseRef.current === 'available') return
    probingRef.current = true
    let reachable = false
    try {
      reachable = await (optionsRef.current.probe ?? probeApi)()
    } finally {
      probingRef.current = false
    }
    if (!mountedRef.current) return

    const current = phaseRef.current
    if (reachable) {
      clearTimer()
      setPhase('available')
      if (current === 'unavailable') optionsRef.current.onRecover?.()
      return
    }

    if (current === 'confirming') {
      confirmAttemptRef.current += 1
      if (confirmAttemptRef.current < CONFIRM_DELAYS_MS.length) {
        schedule(CONFIRM_DELAYS_MS[confirmAttemptRef.current])
        return
      }
      setPhase('unavailable')
    }
    if (phaseRef.current === 'unavailable') scheduleRetry()
  }, [clearTimer, schedule, scheduleRetry, setPhase])

  runProbeRef.current = () => {
    void runProbe()
  }

  const reportConnectivityError = useCallback(() => {
    if (phaseRef.current !== 'available') return
    confirmAttemptRef.current = 0
    retryAttemptRef.current = 0
    setPhase('confirming')
    schedule(CONFIRM_DELAYS_MS[0])
  }, [schedule, setPhase])

  // Keeps the backoff where it was, so a server that keeps saying "unavailable" after the browser
  // could reach the API is retried at a widening interval rather than every two seconds.
  const markUnavailable = useCallback(() => {
    if (phaseRef.current === 'unavailable') return
    setPhase('unavailable')
    scheduleRetry()
  }, [scheduleRetry, setPhase])

  const retryNow = useCallback(() => {
    if (phaseRef.current === 'available') return
    retryAttemptRef.current = 0
    clearTimer()
    runProbeRef.current()
  }, [clearTimer])

  useEffect(() => {
    mountedRef.current = true
    setOffline(browserIsOffline())
    if (phaseRef.current === 'unavailable' && timerRef.current === undefined) scheduleRetry()

    const handleOnline = () => {
      setOffline(false)
      retryNow()
    }
    const handleOffline = () => setOffline(true)
    const handleVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') retryNow()
    }

    globalThis.addEventListener('online', handleOnline)
    globalThis.addEventListener('offline', handleOffline)
    globalThis.addEventListener('focus', handleVisible)
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      mountedRef.current = false
      clearTimer()
      globalThis.removeEventListener('online', handleOnline)
      globalThis.removeEventListener('offline', handleOffline)
      globalThis.removeEventListener('focus', handleVisible)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [clearTimer, retryNow, scheduleRetry])

  return {
    unavailable: phase === 'unavailable',
    offline,
    reportConnectivityError,
    markUnavailable,
    retryNow,
  }
}
