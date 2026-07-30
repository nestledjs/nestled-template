import { describe, it, expect } from 'vitest'
import { resolveErrorMessage, resolveProviderLabel } from '../../../app/routes/auth/oauth-error'

describe('OAuth error page', () => {
  describe('resolveProviderLabel', () => {
    it.each([
      ['google', 'Google'],
      ['github', 'GitHub'],
    ])('maps %s to a display label', (provider, expected) => {
      expect(resolveProviderLabel(provider)).toBe(expected)
    })

    it('returns null for a missing provider', () => {
      expect(resolveProviderLabel(null)).toBeNull()
    })

    it('returns null rather than echoing an unknown provider', () => {
      // The value comes from an untrusted redirect and must never be rendered raw.
      expect(resolveProviderLabel('<script>alert(1)</script>')).toBeNull()
    })
  })

  describe('resolveErrorMessage', () => {
    it('maps a known provider error code to friendly copy', () => {
      expect(resolveErrorMessage('access_denied')).toContain('cancelled')
    })

    it("maps the API's own failure code", () => {
      expect(resolveErrorMessage('authentication_failed')).toContain('could not complete')
    })

    it('falls back to a generic message when no code is present', () => {
      expect(resolveErrorMessage(null)).toContain('Something went wrong')
    })

    it('falls back to a generic message for an unknown code instead of echoing it', () => {
      const hostile = '<img src=x onerror=alert(1)>'
      const message = resolveErrorMessage(hostile)
      expect(message).toContain('Something went wrong')
      expect(message).not.toContain(hostile)
    })
  })
})
