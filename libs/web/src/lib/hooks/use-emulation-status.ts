import { useMemo } from 'react'

interface EmulationStatus {
  isEmulating: boolean
  originalAdminId: string | null
  emulatedUserId: string | null
}

/**
 * Get the session cookie name from environment variable.
 */
function getSessionCookieName(): string {
  if (import.meta?.env?.VITE_COOKIE_NAME) {
    return import.meta.env.VITE_COOKIE_NAME
  }
  return '__session'
}

/**
 * Get cookie value from document.cookie
 */
function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null

  const matches = document.cookie.match(new RegExp(
    '(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'
  ))
  return matches ? decodeURIComponent(matches[1]) : null
}

/**
 * Decode JWT token to check if current session is an emulation
 */
export function useEmulationStatus(): EmulationStatus {
  return useMemo(() => {
    try {
      console.log('[useEmulationStatus] Checking emulation status...')

      // Get the session cookie
      const token = getCookieValue(getSessionCookieName())
      console.log('[useEmulationStatus] Token found:', !!token)

      if (!token) {
        console.log('[useEmulationStatus] No token found in cookies')
        return { isEmulating: false, originalAdminId: null, emulatedUserId: null }
      }

      // Decode JWT (just the payload, no verification needed on client)
      const parts = token.split('.')
      console.log('[useEmulationStatus] Token parts count:', parts.length)

      if (parts.length !== 3) {
        console.log('[useEmulationStatus] Invalid JWT format')
        return { isEmulating: false, originalAdminId: null, emulatedUserId: null }
      }

      // Log the raw token for debugging
      console.log('[useEmulationStatus] Raw token (first 50 chars):', token.substring(0, 50) + '...')
      console.log('[useEmulationStatus] Token payload (base64):', parts[1])

      const payload = JSON.parse(atob(parts[1]))
      console.log('[useEmulationStatus] JWT Payload:', {
        isEmulating: payload.isEmulating,
        originalAdminId: payload.originalAdminId,
        userId: payload.userId,
        fullPayload: payload
      })

      const result = {
        isEmulating: payload.isEmulating === true,
        originalAdminId: payload.originalAdminId || null,
        emulatedUserId: payload.userId || null,
      }

      console.log('[useEmulationStatus] Final result:', result)
      return result
    } catch (error) {
      console.error('[useEmulationStatus] Failed to decode JWT for emulation status:', error)
      return { isEmulating: false, originalAdminId: null, emulatedUserId: null }
    }
  }, []) // Re-compute when component mounts (token changes are handled by page reload)
}
