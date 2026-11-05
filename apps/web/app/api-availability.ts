import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ApolloClient } from '@apollo/client'
import { getApolloContext } from '@apollo/client/react'
import { isRetryableConnectivityError } from '@nestled-template/shared/apollo'

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
  return `${trimTrailingSlashes(import.meta.env.VITE_API_URL || 'http://localhost:3000')}/api/uptime`
}

/** Drops trailing slashes. A loop, not a regex: SonarCloud flags the regex form as a slow-regex risk. */
export function trimTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.endsWith('/', end)) end -= 1
  return value.slice(0, end)
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
  /** Called when a reported failure was a blip: the API answered before the screen went up. */
  onBlipCleared?: () => void
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
  const [phase, setPhase] = useState<Phase>(
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

  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
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
      changePhase('available')
      if (current === 'unavailable') optionsRef.current.onRecover?.()
      if (current === 'confirming') optionsRef.current.onBlipCleared?.()
      return
    }

    if (current === 'confirming') {
      confirmAttemptRef.current += 1
      if (confirmAttemptRef.current < CONFIRM_DELAYS_MS.length) {
        schedule(CONFIRM_DELAYS_MS[confirmAttemptRef.current])
        return
      }
      changePhase('unavailable')
    }
    if (phaseRef.current === 'unavailable') scheduleRetry()
  }, [clearTimer, schedule, scheduleRetry, changePhase])

  runProbeRef.current = () => {
    void runProbe()
  }

  const reportConnectivityError = useCallback(() => {
    if (phaseRef.current !== 'available') return
    confirmAttemptRef.current = 0
    retryAttemptRef.current = 0
    changePhase('confirming')
    schedule(CONFIRM_DELAYS_MS[0])
  }, [schedule, changePhase])

  // Keeps the backoff where it was, so a server that keeps saying "unavailable" after the browser
  // could reach the API is retried at a widening interval rather than every two seconds.
  const markUnavailable = useCallback(() => {
    if (phaseRef.current === 'unavailable') return
    changePhase('unavailable')
    scheduleRetry()
  }, [scheduleRetry, changePhase])

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

/**
 * Refetch every active query whose last result is a connectivity failure: no response at all, or a
 * proxy's 502/503/504 while the API restarts (`isRetryableConnectivityError`, the same test the
 * error link uses to report an outage). Without this a query that failed during a blip too short
 * to put the screen up kept showing its error until the user navigated away.
 *
 * Anything else is left alone, because retrying it would only fail again: GraphQL errors
 * (validation, forbidden, a resolver bug), an HTTP 401 or 403 (the error link already sends the
 * user to log in, or to the access-denied screen), any other answered HTTP status, and an error
 * thrown by application code. Refetching those on every return to the tab replayed the same auth
 * failure, and with it the same logout redirect or access-denied screen, again and again.
 */
export function refetchFailedQueries(client: Pick<ApolloClient, 'getObservableQueries'>): number {
  let refetched = 0
  for (const query of client.getObservableQueries('active')) {
    const { error } = query.getCurrentResult()
    if (isRetryableConnectivityError(error)) {
      refetched += 1
      query.refetch().catch(() => undefined)
    }
  }
  return refetched
}

/**
 * How long the browser's "you're back" events are gathered into one refetch. Coming back to a
 * window fires `focus` and, if the tab was hidden, `visibilitychange` within a few milliseconds of
 * each other; `online` can land in the same moment after a laptop wakes.
 */
export const RETURN_TRIGGER_DEBOUNCE_MS = 250

/**
 * Refetch failed queries when the browser comes back online, the tab is shown again, or a window
 * that stayed visible (side by side with another, say) regains focus, and hand back a function to
 * do it on demand (after a blip, or when the outage screen clears). A no-op outside an
 * ApolloProvider.
 *
 * The browser events are debounced together, so one return to the window refetches once rather
 * than once per event.
 *
 * Refetches are spaced with the same backoff as the probe (2 s doubling to 30 s), reset only when
 * a pass finds no failed query left. Without it, an API whose liveness route answers while
 * GraphQL keeps failing looped: each failure reported a blip, the probe succeeded at once, and
 * the same queries were refetched straight away, forever. A request that arrives inside the
 * backoff window is deferred to the end of it, not dropped.
 */
export function useRefetchFailedQueries(): () => void {
  const client = useContext(getApolloContext()).client
  const attemptRef = useRef(0)
  const nextAllowedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const run = useCallback(() => {
    timerRef.current = undefined
    if (!client) return
    if (refetchFailedQueries(client) === 0) {
      attemptRef.current = 0
      nextAllowedAtRef.current = 0
      return
    }
    nextAllowedAtRef.current = Date.now() + retryDelayMs(attemptRef.current)
    attemptRef.current += 1
  }, [client])

  const refetch = useCallback(() => {
    if (timerRef.current !== undefined) return
    const wait = nextAllowedAtRef.current - Date.now()
    if (wait <= 0) run()
    else timerRef.current = setTimeout(run, wait)
  }, [run])

  useEffect(() => {
    const handleReturn = () => {
      if (returnTimerRef.current !== undefined) clearTimeout(returnTimerRef.current)
      returnTimerRef.current = setTimeout(() => {
        returnTimerRef.current = undefined
        refetch()
      }, RETURN_TRIGGER_DEBOUNCE_MS)
    }
    const handleVisible = () => {
      if (document.visibilityState === 'visible') handleReturn()
    }
    globalThis.addEventListener('online', handleReturn)
    globalThis.addEventListener('focus', handleReturn)
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      globalThis.removeEventListener('online', handleReturn)
      globalThis.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleVisible)
      if (timerRef.current !== undefined) clearTimeout(timerRef.current)
      timerRef.current = undefined
      if (returnTimerRef.current !== undefined) clearTimeout(returnTimerRef.current)
      returnTimerRef.current = undefined
    }
  }, [refetch])

  return refetch
}
