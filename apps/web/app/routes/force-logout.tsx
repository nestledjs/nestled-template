import { getSessionCookieName } from '@nestled-template/shared/utils'

function buildClearCookieHeader(cookieName: string): string[] {
  const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  const base = `${cookieName}=; Path=/; ${expired}; HttpOnly; SameSite=Lax`
  const domain = process.env.VITE_COOKIE_DOMAIN

  if (domain && domain !== 'localhost' && !domain.startsWith('127.')) {
    // Clear for both the configured domain and bare host to handle both cookie scopes
    return [`${base}; Domain=${domain}`, base]
  }
  return [base]
}

export async function loader({ request }: { request: Request }) {
  const cookieName = getSessionCookieName()
  const url = new URL(request.url)
  const returnUrl = url.searchParams.get('return_url')
  const loginPath = returnUrl ? `/login?return_url=${encodeURIComponent(returnUrl)}` : '/login'

  const headers = new Headers()
  for (const cookie of buildClearCookieHeader(cookieName)) {
    headers.append('Set-Cookie', cookie)
  }
  headers.set('Location', loginPath)

  return new Response(null, { status: 302, headers })
}

export default function ForceLogoutRoute() {
  return null
}
