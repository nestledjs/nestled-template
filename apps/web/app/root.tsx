import { ApolloHydrationHelper } from '@apollo/client-integration-react-router'
import '@nestled-template/shared/styles'
import { apolloLoader } from '@nestled-template/shared/apollo'
import { Me, type MeQuery } from '@nestled-template/shared/sdk'
import { getCookie, getSessionCookieName, isJwtExpired, isNetworkError } from '@nestled-template/shared/utils'
import { WebUiErrorBoundary } from '@nestled-template/web-ui'
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

export const loader = apolloLoader()(({ preloadQuery, request }) => {
  const url = new URL(request.url)
  const cookieName = getSessionCookieName()
  const token = getCookie(request.headers, cookieName)
  const isAuthenticated = token && !isJwtExpired(token)

  // Get theme preference from cookie, default to 'dark' if not set
  const theme = getCookie(request.headers, 'theme') || 'dark'

  // Define private routes that require authentication
  const isPrivateRoute =
    url.pathname.startsWith('/members') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/leaders')

  // If accessing a private route without authentication, redirect to login
  if (isPrivateRoute && !isAuthenticated) {
    let loginRedirect = '/login'
    if (url.pathname && url.pathname !== '/') {
      loginRedirect += '?return_url=' + encodeURIComponent(url.pathname)
    }
    const headers = clearSessionCookieHeaders(cookieName)
    headers.set('Location', loginRedirect)
    return new Response(null, { status: 302, headers })
  }

  // If accessing a private route with authentication, preload the Me query
  if (isPrivateRoute && isAuthenticated) {
    try {
      const meQueryRef = preloadQuery<MeQuery>(Me)
      return { meQueryRef, theme }
    } catch (error) {
      console.error('[Root Loader] Error during Me query preload:', error)
      const errorMessage = (error as Error)?.message || ''

      let loginRedirect = '/login'
      if (url.pathname && url.pathname !== '/') {
        loginRedirect += '?return_url=' + encodeURIComponent(url.pathname)
      }

      if (isNetworkError(error)) {
        console.log('[Root Loader] Network error detected, returning serviceUnavailable')
        return { serviceUnavailable: true, theme }
      }

      if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        console.log('[Root Loader] Auth error detected, redirecting to login')
        const headers = clearSessionCookieHeaders(cookieName)
        headers.set('Location', loginRedirect)
        return new Response(null, { status: 302, headers })
      }

      console.log('[Root Loader] Unknown error, returning serviceUnavailable as fallback')
      return { serviceUnavailable: true, theme }
    }
  }

  // For public routes, if authenticated preload Me so user is globally available
  // Skip on /logout — the session will be invalidated mid-flight, causing useReadQuery to throw
  if (isAuthenticated && !url.pathname.startsWith('/logout')) {
    try {
      const meQueryRef = preloadQuery<MeQuery>(Me)
      return { meQueryRef, theme }
    } catch (error) {
      // On error for public pages, just continue without user
      console.warn('[Root Loader] Failed to preload Me on public route:', error)
      return { theme }
    }
  }
  // Not authenticated and not private
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

export function ErrorBoundary({ error }: Readonly<{ error: Error }>) {
  // Auth errors should send the user through logout to clear their session
  const isUnauthorized =
    error.message?.includes('Unauthorized') ||
    (error as any)?.graphQLErrors?.some(
      (e: any) =>
        (e?.message || '').includes('Unauthorized') || e?.extensions?.code === 'UNAUTHENTICATED',
    )

  if (isUnauthorized && typeof window !== 'undefined') {
    window.location.href = '/force-logout'
    return null
  }

  // Layout always wraps this component and provides <html>/<head>/<body> —
  // do not render document-level tags here.
  return <WebUiErrorBoundary error={error} autoRefresh={true} autoRefreshDelay={3000} />
}
