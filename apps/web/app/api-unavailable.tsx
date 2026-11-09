import { useState } from 'react'
import { ServiceUnavailable } from '@nestledjs/shared-components'
import {
  reloadForRecovery,
  useApiAvailability,
  type ApiAvailabilityOptions,
  type UnavailableReason,
} from './api-availability'

// The screen's English copy. An app that translates the screen passes its own strings through the
// `copy` prop (one key per string); anything it leaves out falls back to these.
export const OFFLINE_TITLE = 'You’re offline'
export const OFFLINE_MESSAGE = 'We’ll reconnect automatically when your connection is back.'
export const SERVER_TROUBLE_TITLE = 'We’re having trouble reaching our servers'
export const SERVER_TROUBLE_MESSAGE = 'Retrying automatically.'
export const RETRY_LABEL = 'Try again'

export interface ApiUnavailableCopy {
  /** The browser has no connection. */
  offlineTitle: string
  offlineMessage: string
  /** The connection works but our servers do not answer (or answer 502/503/504). */
  serverTitle: string
  serverMessage: string
  retryLabel: string
}

export const API_UNAVAILABLE_COPY: Readonly<ApiUnavailableCopy> = {
  offlineTitle: OFFLINE_TITLE,
  offlineMessage: OFFLINE_MESSAGE,
  serverTitle: SERVER_TROUBLE_TITLE,
  serverMessage: SERVER_TROUBLE_MESSAGE,
  retryLabel: RETRY_LABEL,
}

/**
 * The "API unavailable" screen. It says whether the browser is offline or our servers are in
 * trouble (`reason`, from `useApiAvailability`), and its button checks the API at once instead of
 * reloading a page that may not load.
 */
export function ApiUnavailableScreen({
  reason,
  onRetry,
  copy,
}: Readonly<{
  reason: UnavailableReason
  onRetry: () => void
  copy?: Partial<ApiUnavailableCopy>
}>) {
  const text = { ...API_UNAVAILABLE_COPY, ...copy }
  const offline = reason === 'offline'
  return (
    <ServiceUnavailable
      title={offline ? text.offlineTitle : text.serverTitle}
      message={offline ? text.offlineMessage : text.serverMessage}
      showRefreshButton={true}
      onRefresh={onRetry}
      refreshLabel={text.retryLabel}
    />
  )
}

/**
 * The screen for a route error boundary that caught a network error. A boundary cannot re-render
 * the route that threw, so recovery reloads the page once the API answers (at most once a minute;
 * after that the button reloads by hand).
 */
export function RecoveringApiUnavailable({
  probe,
  initialReason,
  copy,
  reload = reloadForRecovery,
}: Readonly<
  Pick<ApiAvailabilityOptions, 'probe' | 'initialReason'> & {
    copy?: Partial<ApiUnavailableCopy>
    reload?: () => boolean
  }
>) {
  const [reloadHeldBack, setReloadHeldBack] = useState(false)
  const { unavailable, reason, retryNow } = useApiAvailability({
    initiallyUnavailable: true,
    initialReason,
    probe,
    onRecover: () => {
      if (!reload()) setReloadHeldBack(true)
    },
  })
  const onRetry = unavailable || !reloadHeldBack ? retryNow : () => globalThis.location.reload()
  return <ApiUnavailableScreen reason={reason} onRetry={onRetry} copy={copy} />
}
