import { useCallback, useEffect, useRef, useState } from 'react'
import { useRevalidator } from 'react-router'
import { ServiceUnavailable } from '@nestledjs/shared-components'
import {
  retryDelayMs,
  useApiAvailability,
  type ApiAvailabilityOptions,
  type UnavailableReason,
} from '../api-availability'
import { ApiUnavailableScreen, RETRY_LABEL, type ApiUnavailableCopy } from '../api-unavailable'

export const SESSION_UNKNOWN_TITLE = 'We couldn’t load your account'
export const SESSION_UNKNOWN_MESSAGE = 'You are still signed in. Retrying automatically.'

/**
 * Shown on a private page while the session verdict is `unknown` because the API answered with an
 * error or with no user (not an outage: the API is reachable, so there is nothing to probe). The
 * session is kept. It revalidates with backoff (2 s doubling to 30 s), which runs the session
 * middleware again, until the verdict is known; its button revalidates at once.
 */
export function SessionUnknownScreen() {
  const revalidate = useRevalidateWithBackoff(true)
  return (
    <ServiceUnavailable
      title={SESSION_UNKNOWN_TITLE}
      message={SESSION_UNKNOWN_MESSAGE}
      showRefreshButton={true}
      onRefresh={revalidate}
      refreshLabel={RETRY_LABEL}
    />
  )
}

/**
 * Shown on a private page while the session verdict is `unknown` because of an outage (the API
 * did not answer, or timed out). The session is kept. It shows the outage or offline screen and
 * probes the API; once the API answers it keeps the screen and revalidates with backoff, which
 * runs the session middleware again, until the verdict is known. It never reloads the page: the
 * middleware remembers an outage for a short while (`OUTAGE_MEMORY_MS`), so a single reload can
 * land on the same verdict, and a reload limiter would then leave the screen stuck.
 */
export function SessionOutageScreen({
  probe,
  initialReason,
  copy,
}: Readonly<
  Pick<ApiAvailabilityOptions, 'probe'> & {
    initialReason?: UnavailableReason
    copy?: Partial<ApiUnavailableCopy>
  }
>) {
  const [apiAnswered, setApiAnswered] = useState(false)
  const { unavailable, reason, retryNow } = useApiAvailability({
    initiallyUnavailable: true,
    initialReason,
    probe,
    onRecover: () => setApiAnswered(true),
  })
  const revalidate = useRevalidateWithBackoff(apiAnswered)
  const onRetry = unavailable ? retryNow : revalidate
  return <ApiUnavailableScreen reason={reason} onRetry={onRetry} copy={copy} />
}

/**
 * While `active`, revalidates with backoff (2 s doubling to 30 s), so the session middleware runs
 * again until the verdict is known and the boundary gives way to the page. Returns a function that
 * revalidates at once, for the screen's button.
 */
function useRevalidateWithBackoff(active: boolean): () => void {
  const revalidator = useRevalidator()
  const revalidateRef = useRef(revalidator.revalidate)
  useEffect(() => {
    revalidateRef.current = revalidator.revalidate
  })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const timer = setTimeout(() => {
      setAttempt(current => current + 1)
      void revalidateRef.current()
    }, retryDelayMs(attempt))
    return () => clearTimeout(timer)
  }, [active, attempt])
  return useCallback(() => void revalidateRef.current(), [])
}
