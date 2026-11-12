import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ApolloClient } from '@apollo/client'
import { getApolloContext } from '@apollo/client/react'
import {
  classifyApiFailure,
  clearApiOutage,
  isRetryableConnectivityError,
  signalApiOutage,
} from '@nestled-template/shared/apollo'

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
 * A cheap same-origin URL on the web app itself: a static file, so the server answers it without
 * rendering a page or calling the API. Any HTTP answer counts, so a project without the file (a
 * 404) works just as well.
 */
export function webOriginProbeUrl(): string {
  return `${globalThis.location?.origin ?? ''}/favicon.ico`
}

/** Status of the request, or undefined when it got no HTTP response at all (or timed out). */
async function probeStatus(
  url: string,
  method: 'GET' | 'HEAD',
  timeoutMs: number,
): Promise<number | undefined> {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const response = await fetch(url, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller?.signal,
    })
    return response.status
  } catch {
    return undefined
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
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
  const status = await probeStatus(url, 'GET', timeoutMs)
  return status !== undefined && !GATEWAY_UNAVAILABLE_STATUSES.has(status)
}

/**
 * Why the API cannot be reached, as the screen tells the user:
 * - `offline`: the browser has no connection (it says so, or neither the web app nor the API
 *   answers);
 * - `server`: the connection works but our servers do not (the web app answers and the API does
 *   not, or a proxy answers for the API with 502/503/504).
 */
export type UnavailableReason = 'offline' | 'server'

export interface ConnectivityProbeResult {
  /** The API answered (see `probeApi`). */
  reachable: boolean
  /** When it did not, why. */
  reason?: UnavailableReason
}

/**
 * Probe the API and, when it does not answer at all, the web app's own origin, to tell "you are
 * offline" from "our servers are down". A proxy's 502/503/504 for the API already proves the
 * connection works, so it needs no second request; neither does a browser that says it is offline.
 */
export async function probeConnectivity(
  apiUrl: string = apiProbeUrl(),
  webUrl: string = webOriginProbeUrl(),
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<ConnectivityProbeResult> {
  if (browserIsOffline()) return { reachable: false, reason: 'offline' }
  const apiStatus = await probeStatus(apiUrl, 'GET', timeoutMs)
  if (apiStatus !== undefined) {
    return GATEWAY_UNAVAILABLE_STATUSES.has(apiStatus)
      ? { reachable: false, reason: 'server' }
      : { reachable: true }
  }
  const webStatus = await probeStatus(webUrl, 'HEAD', timeoutMs)
  return { reachable: false, reason: webStatus === undefined ? 'offline' : 'server' }
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

export type ApiAvailabilityPhase = 'available' | 'confirming' | 'unavailable'

export interface ApiAvailabilityOptions {
  /** Called once each time the API answers again after the screen was up. */
  onRecover?: () => void
  /** Called when a reported failure was a blip: the API answered before the screen went up. */
  onBlipCleared?: () => void
  /**
   * Replaces the network probe (tests). A plain boolean says only whether the API answered; the
   * reason then comes from the browser's online flag.
   */
  probe?: () => Promise<boolean | ConnectivityProbeResult>
  /** Mount with the screen already up, e.g. in an error boundary that caught a network error. */
  initiallyUnavailable?: boolean
  /**
   * The reason to start with, before the first probe. A page the server rendered with a 503 passes
   * `server`: it reached the browser, so the connection works. Defaults to `server` (the server
   * render cannot know, and the client's first render must match it); the browser's online flag
   * corrects it as soon as the app mounts.
   */
  initialReason?: UnavailableReason
}

export interface ApiAvailability {
  /** Where the screen's lifecycle is: no outage, a report being confirmed, or the screen is up. */
  phase: ApiAvailabilityPhase
  /** The screen should be shown. False while a report is still being confirmed. */
  unavailable: boolean
  /**
   * Why the API cannot be reached: `offline` (no connection) or `server` (our servers). Updated by
   * every probe, and at once by the browser's `online` and `offline` events.
   */
  reason: UnavailableReason
  /** Shorthand for `reason === 'offline'`. */
  offline: boolean
  /** A request failed without reaching the API: confirm it, and show the screen if it holds. */
  reportConnectivityError: () => void
  /** Show the screen without confirming (the server already found the API unreachable). */
  markUnavailable: () => void
  /** Probe now, e.g. from the screen's button. */
  retryNow: () => void
}

export function useApiAvailability(options: ApiAvailabilityOptions = {}): ApiAvailability {
  const [phase, setPhase] = useState<ApiAvailabilityPhase>(
    options.initiallyUnavailable ? 'unavailable' : 'available',
  )
  const [reason, setReason] = useState<UnavailableReason>(options.initialReason ?? 'server')

  const phaseRef = useRef<ApiAvailabilityPhase>(phase)
  const confirmAttemptRef = useRef(0)
  const retryAttemptRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const probingRef = useRef(false)
  const mountedRef = useRef(true)
  const optionsRef = useRef(options)
  // Refs are written after commit, not during render. A layout effect runs before any effect,
  // timer or event handler that reads them, so they always see this render's values.
  useLayoutEffect(() => {
    optionsRef.current = options
  })

  // Any phase but `available` is outage evidence: while it lasts, a 401 does not log the user out
  // (`signalApiOutage`, keyed by this instance so several mounted checks do not clear each other).
  const outageSignalRef = useRef({})
  const syncOutageSignal = useCallback(() => {
    if (phaseRef.current === 'available') clearApiOutage(outageSignalRef.current)
    else signalApiOutage(outageSignalRef.current)
  }, [])
  const changePhase = useCallback(
    (next: ApiAvailabilityPhase) => {
      phaseRef.current = next
      syncOutageSignal()
      setPhase(next)
    },
    [syncOutageSignal],
  )

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
    let result: ConnectivityProbeResult
    try {
      const outcome = await (optionsRef.current.probe ?? probeConnectivity)()
      result = typeof outcome === 'boolean' ? { reachable: outcome } : outcome
    } finally {
      probingRef.current = false
    }
    if (!mountedRef.current) return
    const reachable = result.reachable
    // Re-checked on every probe, so the message follows the user from offline to server trouble
    // and back as conditions change. The browser's offline flag wins over the probe's answer: a
    // probe started while online can finish (with a proxy's 503, say) after the `offline` event.
    if (!reachable) setReason(browserIsOffline() ? 'offline' : (result.reason ?? 'server'))

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

  useLayoutEffect(() => {
    runProbeRef.current = () => {
      void runProbe()
    }
  }, [runProbe])

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
    const outageSignal = outageSignalRef.current
    syncOutageSignal()
    // navigator.onLine is browser-only. Read during render, it would make the hydrated HTML differ
    // from the server's, so it is read once after mount and kept current by the listeners below.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs browser-only state after hydration
    if (browserIsOffline()) setReason('offline')
    // Re-arm whatever the phase was waiting on. The cleanup below cancels the pending timer, so
    // without this an effect replay (React StrictMode in development, or any re-run) while a report
    // was being confirmed left the phase stuck at `confirming` until an online, focus or
    // visibilitychange event happened to arrive.
    if (timerRef.current === undefined) {
      if (phaseRef.current === 'confirming') {
        schedule(CONFIRM_DELAYS_MS[confirmAttemptRef.current] ?? 0)
      } else if (phaseRef.current === 'unavailable') {
        scheduleRetry()
      }
    }

    const handleOnline = () => {
      // The browser has a connection again; the probe this triggers says whether our servers
      // answer, and puts `server` back if they do not.
      setReason('server')
      retryNow()
    }
    const handleOffline = () => setReason('offline')
    const handleVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') retryNow()
    }

    globalThis.addEventListener('online', handleOnline)
    globalThis.addEventListener('offline', handleOffline)
    globalThis.addEventListener('focus', handleVisible)
    document.addEventListener('visibilitychange', handleVisible)
    return () => {
      mountedRef.current = false
      clearApiOutage(outageSignal)
      clearTimer()
      globalThis.removeEventListener('online', handleOnline)
      globalThis.removeEventListener('offline', handleOffline)
      globalThis.removeEventListener('focus', handleVisible)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [clearTimer, retryNow, schedule, scheduleRetry, syncOutageSignal])

  return {
    phase,
    unavailable: phase === 'unavailable',
    reason,
    offline: reason === 'offline',
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
 *
 * The one exception is `includeAuthFailures`, passed once an outage clears when the error link let
 * a 401 pass during it (`takeDeferredAuthFailure`): those queries were never sent to logout, so
 * they are refetched for a fresh answer, and a 401 then, with no outage, logs out as usual.
 */
export function refetchFailedQueries(
  client: Pick<ApolloClient, 'getObservableQueries'>,
  options: { includeAuthFailures?: boolean } = {},
): number {
  let refetched = 0
  for (const query of client.getObservableQueries('active')) {
    const { error } = query.getCurrentResult()
    if (
      isRetryableConnectivityError(error) ||
      (options.includeAuthFailures && error && classifyApiFailure(error) === 'unauthenticated')
    ) {
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
export function useRefetchFailedQueries(): (options?: { includeAuthFailures?: boolean }) => void {
  const client = useContext(getApolloContext()).client
  // Kept until the next pass runs, so a request deferred by the backoff does not lose it.
  const includeAuthFailuresRef = useRef(false)
  const attemptRef = useRef(0)
  const nextAllowedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const run = useCallback(() => {
    timerRef.current = undefined
    if (!client) return
    const includeAuthFailures = includeAuthFailuresRef.current
    includeAuthFailuresRef.current = false
    if (refetchFailedQueries(client, { includeAuthFailures }) === 0) {
      attemptRef.current = 0
      nextAllowedAtRef.current = 0
      return
    }
    nextAllowedAtRef.current = Date.now() + retryDelayMs(attemptRef.current)
    attemptRef.current += 1
  }, [client])

  const refetch = useCallback(
    (options?: { includeAuthFailures?: boolean }) => {
      if (options?.includeAuthFailures) includeAuthFailuresRef.current = true
      if (timerRef.current !== undefined) return
      const wait = nextAllowedAtRef.current - Date.now()
      if (wait <= 0) run()
      else timerRef.current = setTimeout(run, wait)
    },
    [run],
  )

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
