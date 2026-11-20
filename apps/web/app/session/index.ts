// The session module: the only place in the web app that may decide a session. Everything else
// reads the verdict (`getSession`, `requireUser`). See docs in session-middleware.server.ts.
export {
  getSession,
  requireUser,
  SESSION_UNKNOWN_CODE,
  sessionContext,
  type AppSessionVerdict,
  type SessionUser,
} from './session-context'
export {
  isUnauthenticatedRouteError,
  requestSessionRevalidation,
  RevalidateSessionOnMount,
  SessionRevalidator,
  useSessionRevalidation,
} from './session-revalidator'
export { expiredSessionCookies } from './session-cookie'
