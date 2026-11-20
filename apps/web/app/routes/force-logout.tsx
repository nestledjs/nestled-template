import { getSessionCookieName } from '@nestled-template/shared/utils'
import { expiredSessionCookies } from '../session/session-cookie'

export async function loader({ request }: { request: Request }) {
  const cookieName = getSessionCookieName()
  const url = new URL(request.url)
  const returnUrl = url.searchParams.get('return_url')
  // The organization stored for `x-organization-id` lives in localStorage, which a server redirect
  // cannot reach: the login form this lands on forgets it as it opens, as /logout does.
  // Always append `expired=1`. Even after clearing the cookie (which can fail when the web
  // service lacks the API's cookie domain on a split-subdomain deploy), the login page
  // must not auto-redirect back to the dashboard.
  const params = new URLSearchParams()
  if (returnUrl) {
    params.set('return_url', returnUrl)
  }
  params.set('expired', '1')
  const loginPath = `/login?${params.toString()}`

  const headers = new Headers()
  for (const cookie of expiredSessionCookies(cookieName)) {
    headers.append('Set-Cookie', cookie)
  }
  headers.set('Location', loginPath)

  return new Response(null, { status: 302, headers })
}

export default function ForceLogoutRoute() {
  return null
}
