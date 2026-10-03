import React from 'react'
import { Link, LoaderFunctionArgs, redirect } from 'react-router'
import { getCookie, getSessionCookieName, isJwtExpired } from '@nestled-template/shared/utils'
import { AuthLayout } from '@nestled-template/web'

// Where a completed OAuth sign-in lands. Mirrors login.tsx's DEFAULT_POST_LOGIN.
const POST_LOGIN = '/members/dashboard'

/**
 * Landing route for the API's Google/GitHub callbacks (`/api/auth/<provider>/callback` redirects
 * here on success). The session cookie is already set by the API before this redirect, so there is
 * nothing to complete client-side — resolve it on the server and bounce, which avoids showing a
 * pointless interstitial flash.
 *
 * If the cookie is somehow absent or expired by the time we get here, the sign-in did not
 * actually complete; send the user back to the form rather than to a dashboard that will bounce
 * them straight out again.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const token = getCookie(request.headers, getSessionCookieName())

  if (token && !isJwtExpired(token)) {
    throw redirect(POST_LOGIN)
  }

  throw redirect('/login?error=oauth_incomplete')
}

// Rendered only if the loader somehow does not redirect — kept so the route degrades to something
// useful instead of a blank page.
export default function OAuthSuccessPage() {
  return (
    <AuthLayout title="You're signed in" subtitle="Finishing up...">
      <div className="text-center">
        <div className="mb-6 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
          <p>Your account is connected and you are signed in.</p>
        </div>

        <Link
          to={POST_LOGIN}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
        >
          Continue
        </Link>
      </div>
    </AuthLayout>
  )
}
