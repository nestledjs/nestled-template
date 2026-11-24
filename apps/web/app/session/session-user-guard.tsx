import { type ReactNode, useContext, useEffect, useLayoutEffect, useState } from 'react'
import {
  type RouterState,
  UNSAFE_DataRouterContext as DataRouterContext,
  UNSAFE_DataRouterStateContext as DataRouterStateContext,
} from 'react-router'
import {
  clearActiveOrganizationForSessionChange,
  isLeavingForSessionChange,
} from '@nestled-template/shared/apollo'
import { RecoveringApiUnavailable } from '../api-unavailable'
import type { AppSessionVerdict } from './session-context'

// The last user this document rendered signed in. Browser only, and module-level on purpose: it
// lives exactly as long as the document (and the Apollo cache, which holds that user's data), and a
// signed-out verdict in between, or the root ErrorBoundary replacing App, does not reset it.
let lastSignedInUserId: string | undefined
// Set with the one reload this document makes; nothing clears it.
let reloading = false
// Only while a document load for another session is already on its way (`isLeavingForSessionChange`).
let leavingTimer: ReturnType<typeof setTimeout> | undefined

/** How long a document load already on its way has before this document is loaded instead. */
export const LEAVING_GRACE_MS = 10_000

// While a document restored from the back/forward cache waits for its first verdict: the loader data
// it was restored with, and the bound on the wait.
let restoredWith: RouterState['loaderData'] | undefined
let restoreTimer: ReturnType<typeof setTimeout> | undefined

/** How long a restored document may stay hidden before the recovering screen replaces it. */
export const RESTORE_CHECK_MS = 10_000

const CHECKING_ATTRIBUTE = 'data-session-checking'
/** Hides everything (portals and dialogs too) without unmounting it or losing its scroll position. */
export const SESSION_CHECK_STYLE = `[${CHECKING_ATTRIBUTE}] * { visibility: hidden !important; }`

/** For specs: forget the document's user, as a document load does. */
export function __resetSessionUserGuard(): void {
  lastSignedInUserId = undefined
  reloading = false
  restoredWith = undefined
  clearTimeout(restoreTimer)
  document.documentElement.removeAttribute(CHECKING_ATTRIBUTE)
  clearTimeout(leavingTimer)
  leavingTimer = undefined
}

function reloadDocumentOnce(): void {
  if (reloading) return
  reloading = true
  // The stored organization is the previous user's too.
  clearActiveOrganizationForSessionChange()
  globalThis.location.reload()
}

function belongsToAnotherUser(userId: string | undefined): boolean {
  return (
    globalThis.window !== undefined &&
    userId !== undefined &&
    lastSignedInUserId !== undefined &&
    lastSignedInUserId !== userId
  )
}

function showRestoredDocument(): void {
  restoredWith = undefined
  clearTimeout(restoreTimer)
  document.documentElement.removeAttribute(CHECKING_ATTRIBUTE)
}

/**
 * A document restored from the back/forward cache (browser Back) comes back as it was left, with no
 * request: whoever was signed in then. It asks the server to judge the session again, and if it had
 * rendered a signed-in user it is hidden, but stays mounted, until that verdict has rendered:
 * - the same user: shown as it was left, forms included;
 * - another user: stays hidden, and `SessionUserGuard` loads the document again;
 * - signed out: stays hidden. A private page is redirected by the server (`requireSession`), and a
 *   public one is loaded again here, as the previous user's data may be on it;
 * - unknown, or the request failed: shown, with the root ErrorBoundary's recovering screen. The
 *   session is kept.
 *
 * Without any answer for `RESTORE_CHECK_MS` the recovering screen replaces the page, so it cannot
 * stay blank. A document that was left for another session is simply loaded again.
 */
function useRestoredDocumentCheck(session: AppSessionVerdict | undefined): boolean {
  const router = useContext(DataRouterContext)?.router
  const loaderData = useContext(DataRouterStateContext)?.loaderData
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    if (!router) return undefined
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      if (isLeavingForSessionChange()) {
        globalThis.location.reload()
        return
      }
      if (lastSignedInUserId !== undefined) {
        document.documentElement.setAttribute(CHECKING_ATTRIBUTE, '')
        restoredWith = router.state.loaderData
        clearTimeout(restoreTimer)
        restoreTimer = setTimeout(() => {
          showRestoredDocument()
          setStalled(true)
        }, RESTORE_CHECK_MS)
      }
      void router.revalidate()
    }
    globalThis.addEventListener('pageshow', onPageShow)
    return () => globalThis.removeEventListener('pageshow', onPageShow)
  }, [router])

  // A revalidation ends with new loader data, whatever its outcome, so this is its first render.
  useLayoutEffect(() => {
    if (restoredWith === undefined || loaderData === restoredWith) return
    if (belongsToAnotherUser(session?.kind === 'signed-in' ? session.user.id : undefined)) return
    if (session?.kind === 'signed-out') reloadDocumentOnce()
    else showRestoredDocument()
  }, [loaderData, session])

  return stalled
}

/**
 * Wraps the whole page (root.tsx Layout). When the server judges this document signed in as another
 * user than it last rendered (another tab signed in as someone else, so the cookie changed under
 * this one), the Apollo cache and every mounted component still hold the previous user's data.
 * Nothing of it may render for the new session: `children` are not rendered, and the document is
 * loaded again, once, which starts clean. The new document's first user is its own, so it cannot
 * loop. The same user changes nothing, and a signed-out or unknown verdict is ignored.
 *
 * A document already leaving for another session (a sign-in, an emulation starting or ending) is
 * not loaded a second time: that would replace the navigation on its way. Only if that navigation
 * never happens (the user stopped it) is the document loaded after `LEAVING_GRACE_MS`, so the page
 * cannot stay blank.
 *
 * It also judges a restored document again before showing it: `useRestoredDocumentCheck`.
 */
export function SessionUserGuard({
  session,
  children,
}: Readonly<{ session: AppSessionVerdict | undefined; children: ReactNode }>) {
  const userId = session?.kind === 'signed-in' ? session.user.id : undefined
  const blocked = reloading || belongsToAnotherUser(userId)
  const stalled = useRestoredDocumentCheck(session)
  useLayoutEffect(() => {
    if (userId === undefined || reloading) return
    if (!belongsToAnotherUser(userId)) {
      lastSignedInUserId = userId
      return
    }
    if (isLeavingForSessionChange()) {
      leavingTimer ??= setTimeout(reloadDocumentOnce, LEAVING_GRACE_MS)
    } else {
      reloadDocumentOnce()
    }
  }, [userId])
  if (blocked) return null
  return stalled ? <RecoveringApiUnavailable /> : children
}
