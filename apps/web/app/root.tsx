import { ApolloHydrationHelper } from '@apollo/client-integration-react-router'
import '@nestled-template/shared/styles'
import { apolloLoader } from '@nestled-template/shared/apollo'
import { Me, type MeQuery } from '@nestled-template/shared/sdk'
import {
  getCookie,
  getSessionCookieName,
  isJwtExpired,
  isNetworkError,
} from '@nestled-template/shared/utils'
import { ErrorBoundary as AppErrorBoundary } from '@nestledjs/shared-components'
import { ReactNode } from 'react'
import {
  Links,
  type LinksFunction,
  Meta,
  type MetaFunction,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from 'react-router'
import { GTMNoScript, GTMScript } from './gtm'
import App from './app'

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

function clearSessionCookieHeaders(cookieName: string): Headers {
  const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  const base = `${cookieName}=; Path=/; ${expired}; HttpOnly; SameSite=Lax`
  const domain = process.env.VITE_COOKIE_DOMAIN
  const headers = new Headers()
  if (domain && domain !== 'localhost' && !domain.startsWith('127.')) {
    headers.append('Set-Cookie', `${base}; Domain=${domain}`)
  }
  headers.append('Set-Cookie', base)
  return headers
}

function buildLoginRedirect(pathname: string) {
  if (pathname && pathname !== '/') {
    return '/login?return_url=' + encodeURIComponent(pathname)
  }
  return '/login'
}

function buildAuthRedirectResponse(cookieName: string, loginRedirect: string) {
  const headers = clearSessionCookieHeaders(cookieName)
  headers.set('Location', loginRedirect)
  return new Response(null, { status: 302, headers })
}

function handlePrivateRoutePreloadError(
  error: unknown,
  cookieName: string,
  loginRedirect: string,
  theme: string,
) {
  console.error('[Root Loader] Error during Me query preload:', error)
  const errorMessage = (error as Error)?.message || ''

  if (isNetworkError(error)) {
    console.log('[Root Loader] Network error detected, returning serviceUnavailable')
    return { serviceUnavailable: true, theme }
  }

  if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
    console.log('[Root Loader] Auth error detected, redirecting to login')
    return buildAuthRedirectResponse(cookieName, loginRedirect)
  }

  console.log('[Root Loader] Unknown error, returning serviceUnavailable as fallback')
  return { serviceUnavailable: true, theme }
}

export const loader = apolloLoader()(({ preloadQuery, request }) => {
  const url = new URL(request.url)
  const cookieName = getSessionCookieName()
  const token = getCookie(request.headers, cookieName)
  const isAuthenticated = token && !isJwtExpired(token)
  const theme = getCookie(request.headers, 'theme') || 'dark'

  const isPrivateRoute =
    url.pathname.startsWith('/members') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/leaders')

  if (isPrivateRoute && !isAuthenticated) {
    return buildAuthRedirectResponse(cookieName, buildLoginRedirect(url.pathname))
  }

  if (isPrivateRoute && isAuthenticated) {
    try {
      const meQueryRef = preloadQuery<MeQuery>(Me)
      return { meQueryRef, theme }
    } catch (error) {
      return handlePrivateRoutePreloadError(
        error,
        cookieName,
        buildLoginRedirect(url.pathname),
        theme,
      )
    }
  }

  if (isAuthenticated && !url.pathname.startsWith('/logout')) {
    try {
      const meQueryRef = preloadQuery<MeQuery>(Me)
      return { meQueryRef, theme }
    } catch (error) {
      console.warn('[Root Loader] Failed to preload Me on public route:', error)
      return { theme }
    }
  }

  return { theme }
})

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

type GraphQLErrorLike = {
  message?: string
  extensions?: {
    code?: string
  }
}

type ErrorWithGraphQLErrors = Error & {
  graphQLErrors?: GraphQLErrorLike[]
}

export function ErrorBoundary({ error }: Readonly<{ error: Error }>) {
  // Auth errors should send the user through logout to clear their session
  const graphQLError = error as ErrorWithGraphQLErrors
  const isUnauthorized =
    error.message?.includes('Unauthorized') ||
    error.message?.includes('Session has been invalidated') ||
    graphQLError.graphQLErrors?.some(
      e =>
        (e.message || '').includes('Unauthorized') ||
        (e.message || '').includes('Session has been invalidated') ||
        e.extensions?.code === 'UNAUTHENTICATED',
    )

  if (isUnauthorized && globalThis.window !== undefined) {
    globalThis.location.href = '/force-logout'
    return null
  }

  // Layout always wraps this component and provides <html>/<head>/<body> —
  // do not render document-level tags here.
  return <AppErrorBoundary error={error} autoRefresh={true} autoRefreshDelay={3000} />
}
