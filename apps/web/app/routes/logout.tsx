import { gql } from '@apollo/client'
import { useApolloClient } from '@apollo/client/react'
import Cookies from 'js-cookie'
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { WebUiLoading } from '@nestled-template/web-ui'

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`

export default function LogoutRoute() {
  const apollo = useApolloClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnUrl = searchParams.get('return_url')

  useEffect(() => {
    async function doLogout() {
      // Remove any non-httpOnly cookies we set client-side first
      const cookieNames = ['__user', '__leaderChapter', '__originalUser']
      for (const name of cookieNames) {
        try {
          Cookies.remove(name)
        } catch (e) {
          // ignore
        }
      }

      try {
        // Server-side logout (clears httpOnly session cookie)
        await apollo.mutate({ mutation: LOGOUT_MUTATION })
      } catch (e) {
        // Continue even if mutation fails
        console.warn('[logout] logoutMutation failed (continuing):', (e as Error)?.message)
      }

      try {
        // Clear Apollo cache without refetching queries
        // Use stop() to prevent any in-flight queries from refetching
        apollo.stop()
        await apollo.clearStore()
      } catch (e) {
        console.warn('[logout] apollo.clearStore failed (continuing):', (e as Error)?.message)
      }

      // Navigate to login with optional return URL
      const loginPath = returnUrl ? `/login?return_url=${encodeURIComponent(returnUrl)}` : '/login'
      navigate(loginPath, { replace: true })
    }

    doLogout().catch(e => {
      console.error('[logout] Unexpected error during logout:', e)
      const loginPath = returnUrl ? `/login?return_url=${encodeURIComponent(returnUrl)}` : '/login'
      navigate(loginPath, { replace: true })
    })
  }, [apollo, navigate, returnUrl])

  return <WebUiLoading />
}
