import { useState } from 'react'
import { ServiceUnavailable } from '@nestledjs/shared-components'
import {
  reloadForRecovery,
  useApiAvailability,
  type ApiAvailabilityOptions,
} from './api-availability'

export const OFFLINE_TITLE = 'You’re offline'
export const OFFLINE_MESSAGE = 'We’ll reconnect automatically when your connection is back.'
export const SERVER_DOWN_TITLE = 'Can’t reach the server'
export const SERVER_DOWN_MESSAGE = 'We can’t reach our servers right now. Retrying automatically…'
export const RETRY_LABEL = 'Try again'

/**
 * The "API unavailable" screen. It says whether the browser is offline or the servers are, and its
 * button checks the API at once instead of reloading a page that may not load.
 */
export function ApiUnavailableScreen({
  offline,
  onRetry,
}: Readonly<{ offline: boolean; onRetry: () => void }>) {
  return (
    <ServiceUnavailable
      title={offline ? OFFLINE_TITLE : SERVER_DOWN_TITLE}
      message={offline ? OFFLINE_MESSAGE : SERVER_DOWN_MESSAGE}
      showRefreshButton={true}
      onRefresh={onRetry}
      refreshLabel={RETRY_LABEL}
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
  reload = reloadForRecovery,
}: Readonly<Pick<ApiAvailabilityOptions, 'probe'> & { reload?: () => boolean }>) {
  const [reloadHeldBack, setReloadHeldBack] = useState(false)
  const { unavailable, offline, retryNow } = useApiAvailability({
    initiallyUnavailable: true,
    probe,
    onRecover: () => {
      if (!reload()) setReloadHeldBack(true)
    },
  })
  const onRetry = unavailable || !reloadHeldBack ? retryNow : () => globalThis.location.reload()
  return <ApiUnavailableScreen offline={offline} onRetry={onRetry} />
}
