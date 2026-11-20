import { ApolloHydrationHelper } from '@apollo/client-integration-react-router'
import '@nestled-template/shared/styles'
import {
  getCookie,
  isFetchFailure,
  isNetworkError,
  isViteCacheError,
} from '@nestled-template/shared/utils'
import { ErrorBoundary as AppErrorBoundary, ErrorBoundaryUi } from '@nestledjs/shared-components'
import { ReactNode } from 'react'
import {
  Links,
  type LinksFunction,
  type LoaderFunctionArgs,
  Meta,
  type MetaFunction,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
} from 'react-router'
import { GTMNoScript, GTMScript } from './gtm'
import App from './app'
import { AccessDenied } from './access-denied'
import { isOrganizationContextRequired, OrganizationRequired } from './organization-required'
import { RecoveringApiUnavailable, RETRY_LABEL } from './api-unavailable'
import {
  getSession,
  isUnauthenticatedRouteError,
  RevalidateSessionOnMount,
  type AppSessionVerdict,
} from './session'
import { sessionMiddleware } from './session/session-middleware.server'
import { SESSION_UNKNOWN_CODE } from './session/session-context'
import { SessionOutageScreen, SessionUnknownScreen } from './session/session-unknown'

export const meta: MetaFunction = () => [
  {
    title: 'Demo Site',
  },
]

export const links: LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
]

/**
 * The session is judged here, once per request, before any loader runs (document loads, client
 * navigations and revalidations alike). Private layouts add `requireSession`; nothing else in the
 * app decides a session. See apps/web/app/session/.
 */
export const middleware = [sessionMiddleware]

export interface RootLoaderData {
  session: AppSessionVerdict
  theme: string
}

/**
 * Reads the verdict the session middleware stored and hands it to the browser: App renders the
 * user from it (no second Me request) and public pages pick their header from it.
 */
export function loader({ request, context }: LoaderFunctionArgs): RootLoaderData {
  return {
    session: getSession(context),
    theme: getCookie(request.headers, 'theme') || 'dark',
  }
}

export function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const gtmTrackingId = import.meta.env.VITE_GTM_TRACKING_ID
  const data = useLoaderData() as { theme?: string }
  const theme = data?.theme || 'dark'

  return (
    <html lang="en" className={theme === 'dark' ? 'dark' : ''}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Demo Site</title>
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Get theme from localStorage
                  var localTheme = localStorage.getItem('theme');

                  // If localStorage has a theme, update the class if needed
                  if (localTheme === 'light' && document.documentElement.classList.contains('dark')) {
                    document.documentElement.classList.remove('dark');
                  } else if (localTheme === 'dark' && !document.documentElement.classList.contains('dark')) {
                    document.documentElement.classList.add('dark');
                  }

                  // Save preference to cookie for SSR
                  if (localTheme) {
                    document.cookie = 'theme=' + localTheme + '; path=/; max-age=31536000; SameSite=Lax';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <GTMScript gtmId={gtmTrackingId} />
      </head>
      <body>
        <GTMNoScript gtmId={gtmTrackingId} />
        <ApolloHydrationHelper>{children}</ApolloHydrationHelper>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default App

function routeErrorCode(error: unknown): unknown {
  if (!isRouteErrorResponse(error)) return undefined
  return (error.data as { code?: unknown } | null | undefined)?.code
}

/**
 * The root error boundary. It never navigates to /login, /logout or /force-logout: only the
 * session middleware decides a session.
 * - `SESSION_UNKNOWN` (503 from `requireSession`): the session is kept; an outage or a timeout gets
 *   the outage screen, which probes the API and then revalidates with backoff until the verdict is
 *   known; an answered error or an empty Me gets "We couldn't load your account", which retries by
 *   itself.
 * - a route 401 (`API_UNAUTHENTICATED`: a call refused after the session was judged signed in):
 *   one revalidation, so the middleware judges the session afresh, then the route's error screen.
 * - 403: access denied, or the organization picker.
 * - 502/503/504 or no answer: the self-recovering screen.
 */
export function ErrorBoundary({ error }: Readonly<{ error: unknown }>) {
  const normalizedError = error instanceof Error ? error : new Error('An unexpected error occurred')
  const routeStatus = isRouteErrorResponse(error) ? error.status : undefined

  if (routeErrorCode(error) === SESSION_UNKNOWN_CODE) {
    const reason = (error as { data?: { reason?: unknown } }).data?.reason
    if (reason === 'answered-error' || reason === 'empty') return <SessionUnknownScreen />
    return <SessionOutageScreen initialReason="server" />
  }

  if (isUnauthenticatedRouteError(error)) {
    return (
      <RevalidateSessionOnMount>
        <RouteStatusScreen status={401} statusText={routeStatusText(error) || 'Unauthorized'} />
      </RevalidateSessionOnMount>
    )
  }

  const refusal = refusalScreen(error, routeStatus)
  if (refusal) return refusal

  // A connectivity failure (no response from the API, or a proxy's 502/503/504 while it
  // restarts) gets the screen that probes the API and reloads by itself once it answers. A route
  // status means a server answered (the server render's 503 among them: the page reached the
  // browser), so the connection works and the trouble is ours.
  if (isConnectivityFailure(error, routeStatus)) {
    return (
      <RecoveringApiUnavailable initialReason={routeStatus === undefined ? undefined : 'server'} />
    )
  }

  // Any other route error response (a loader's 404, a 500 thrown as a Response) keeps its status.
  // Rendering it as the generic error turned every missing page into "Something went wrong".
  if (isRouteErrorResponse(error)) {
    return <RouteStatusScreen status={error.status} statusText={error.statusText} />
  }

  // Layout always wraps this component and provides <html>/<head>/<body> —
  // do not render document-level tags here.
  if (isViteCacheError(normalizedError)) {
    return <AppErrorBoundary error={normalizedError} autoRefresh={true} autoRefreshDelay={3000} />
  }

  return <RootErrorScreen error={normalizedError} />
}

function routeStatusText(error: unknown): string | undefined {
  return isRouteErrorResponse(error) ? error.statusText : undefined
}

/**
 * The screen for a signed-in request the API refused, which never logs out: access denied for a
 * route-level 403, or, when the page needs an organization and none is active, the
 * organization-required screen.
 */
function refusalScreen(error: unknown, routeStatus: number | undefined): ReactNode {
  // First: the server render answers a loader's ORGANIZATION_CONTEXT_REQUIRED with a 403 route
  // error response carrying the code, which the access-denied check below would otherwise take.
  if (isOrganizationContextRequired(error)) return <OrganizationRequired />
  if (routeStatus === 403) return <AccessDenied />
  return null
}

const GATEWAY_UNAVAILABLE_STATUSES = new Set([502, 503, 504])

function isConnectivityFailure(error: unknown, routeStatus: number | undefined): boolean {
  if (routeStatus !== undefined) return GATEWAY_UNAVAILABLE_STATUSES.has(routeStatus)
  return isFetchFailure(error) || isNetworkError(error)
}

export const NOT_FOUND_TITLE = 'Page not found'
export const NOT_FOUND_MESSAGE = 'The page you’re looking for doesn’t exist or has moved.'

/** A route error response: a not-found page for 404, otherwise its status and status text. */
function RouteStatusScreen({
  status,
  statusText,
}: Readonly<{ status: number; statusText: string }>) {
  const notFound = status === 404
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{status}</p>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        {notFound ? NOT_FOUND_TITLE : statusText || 'Something went wrong'}
      </h1>
      {notFound && <p className="text-gray-600 dark:text-gray-300">{NOT_FOUND_MESSAGE}</p>}
      {notFound ? (
        <a
          href="/"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Go to the home page
        </a>
      ) : (
        <button
          type="button"
          onClick={() => globalThis.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {RETRY_LABEL}
        </button>
      )}
    </main>
  )
}

/** Any other error: the details, and a manual "Try again" that loads the page again. */
function RootErrorScreen({ error }: Readonly<{ error: Error }>) {
  return (
    <div>
      <ErrorBoundaryUi error={error} />
      <div className="flex justify-center pb-10">
        <button
          type="button"
          onClick={() => globalThis.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {RETRY_LABEL}
        </button>
      </div>
    </div>
  )
}
