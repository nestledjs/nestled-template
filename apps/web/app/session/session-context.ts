import { createContext, type RouterContextProvider } from 'react-router'
import type { SessionVerdict } from '@nestled-template/shared/apollo'
import type { MeQuery } from '@nestled-template/shared/sdk'

/** The signed-in user, exactly as the session middleware's Me call returned it. */
export type SessionUser = NonNullable<MeQuery['me']>

/** The request's session verdict, judged once by `sessionMiddleware` before any loader runs. */
export type AppSessionVerdict = SessionVerdict<SessionUser>

/**
 * Where `sessionMiddleware` (the root route's middleware) stores the verdict. Read it with
 * `getSession(context)` or `requireUser(context)`; never set it anywhere else.
 */
export const sessionContext = createContext<AppSessionVerdict>()

/**
 * The code of the 503 route error `requireSession` throws while the verdict is `unknown`; the root
 * ErrorBoundary shows the session screens for it. Here, not in the .server module, because the
 * ErrorBoundary is client code.
 */
export const SESSION_UNKNOWN_CODE = 'SESSION_UNKNOWN'

type ContextReader = Pick<Readonly<RouterContextProvider>, 'get'>

/**
 * The request's session verdict, for any loader, action or middleware below the root. Loaders read
 * it; they never decide a session themselves (no 401 handling, no redirect to /login).
 */
export function getSession(context: ContextReader): AppSessionVerdict {
  try {
    return context.get(sessionContext)
  } catch (error) {
    throw new Error(
      'getSession called before sessionMiddleware ran: the root route must export ' +
        '`middleware = [sessionMiddleware]` (apps/web/app/root.tsx)',
      { cause: error },
    )
  }
}

/**
 * The signed-in user, for a loader or action under a route whose middleware includes
 * `requireSession`, which has already sent every other verdict elsewhere. Anywhere else this is a
 * programming error, not a sign-out, and it throws as one.
 */
export function requireUser(context: ContextReader): SessionUser {
  const session = getSession(context)
  if (session.kind !== 'signed-in') {
    throw new Error(
      `requireUser called outside requireSession (the session is ${session.kind}): add ` +
        '`middleware = [requireSession]` to the layout route, or read getSession(context)',
    )
  }
  return session.user
}
