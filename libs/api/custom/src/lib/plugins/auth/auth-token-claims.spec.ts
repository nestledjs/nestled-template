import { claimedAuthGeneration, isAuthTokenCurrent } from './auth-token-claims'

describe('auth token claims', () => {
  let data: { user: { findUnique: jest.Mock }; userSession: { findUnique: jest.Mock } }
  const user = { id: 'user-1', authGeneration: 0 }

  beforeEach(() => {
    data = {
      user: { findUnique: jest.fn() },
      userSession: { findUnique: jest.fn().mockResolvedValue({ isValid: true, userId: 'user-1' }) },
    }
  })

  describe('claimedAuthGeneration', () => {
    it('reads a missing or malformed claim as 0', () => {
      expect(claimedAuthGeneration(undefined)).toBe(0)
      expect(claimedAuthGeneration('2')).toBe(0)
      expect(claimedAuthGeneration(1.5)).toBe(0)
      expect(claimedAuthGeneration(3)).toBe(3)
    })
  })

  describe('isAuthTokenCurrent', () => {
    it('accepts a token without the claim while the user is still on generation 0', async () => {
      await expect(
        isAuthTokenCurrent(data as never, { userId: 'user-1', sessionId: 'session-1' }, user),
      ).resolves.toBe(true)
    })

    it('refuses a token once the user has moved to a later generation', async () => {
      const moved = { id: 'user-1', authGeneration: 1 }

      await expect(
        isAuthTokenCurrent(data as never, { userId: 'user-1', sessionId: 'session-1' }, moved),
      ).resolves.toBe(false)
      await expect(
        isAuthTokenCurrent(
          data as never,
          { userId: 'user-1', sessionId: 'session-1', authGeneration: 0 },
          moved,
        ),
      ).resolves.toBe(false)
      // Refused on the generation alone, whatever the session says.
      expect(data.userSession.findUnique).not.toHaveBeenCalled()
    })

    it('refuses a token whose session is invalid or belongs to another user', async () => {
      data.userSession.findUnique.mockResolvedValueOnce({ isValid: false, userId: 'user-1' })
      await expect(
        isAuthTokenCurrent(data as never, { userId: 'user-1', sessionId: 'session-1' }, user),
      ).resolves.toBe(false)

      data.userSession.findUnique.mockResolvedValueOnce({ isValid: true, userId: 'user-2' })
      await expect(
        isAuthTokenCurrent(data as never, { userId: 'user-1', sessionId: 'session-1' }, user),
      ).resolves.toBe(false)

      data.userSession.findUnique.mockResolvedValueOnce(null)
      await expect(
        isAuthTokenCurrent(data as never, { userId: 'user-1', sessionId: 'session-1' }, user),
      ).resolves.toBe(false)
    })

    it('refuses a token whose session has expired', async () => {
      data.userSession.findUnique.mockResolvedValueOnce({
        isValid: true,
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
      })
      await expect(
        isAuthTokenCurrent(data as never, { userId: 'user-1', sessionId: 'session-1' }, user),
      ).resolves.toBe(false)

      data.userSession.findUnique.mockResolvedValueOnce({
        isValid: true,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      })
      await expect(
        isAuthTokenCurrent(data as never, { userId: 'user-1', sessionId: 'session-1' }, user),
      ).resolves.toBe(true)
    })

    describe('emulation tokens', () => {
      const emulation = {
        userId: 'user-1',
        authGeneration: 0,
        isEmulating: true,
        originalAdminId: 'admin-1',
        adminAuthGeneration: 2,
        sessionId: 'emulation-session',
      }

      beforeEach(() => {
        data.user.findUnique.mockResolvedValue({ authGeneration: 2 })
        data.userSession.findUnique.mockResolvedValue({ isValid: true, userId: 'admin-1' })
      })

      it('accepts one whose admin-owned session and both generations are current', async () => {
        await expect(isAuthTokenCurrent(data as never, emulation, user)).resolves.toBe(true)
        expect(data.user.findUnique).toHaveBeenCalledWith({
          where: { id: 'admin-1' },
          select: { authGeneration: true },
        })
      })

      it('refuses one without a session', async () => {
        const withoutSession = { ...emulation, sessionId: undefined }
        await expect(isAuthTokenCurrent(data as never, withoutSession, user)).resolves.toBe(false)
      })

      it("is refused once the admin's generation moves (password reset, deactivation)", async () => {
        data.user.findUnique.mockResolvedValue({ authGeneration: 3 })
        await expect(isAuthTokenCurrent(data as never, emulation, user)).resolves.toBe(false)
      })

      it("is refused once the emulated user's generation moves", async () => {
        await expect(
          isAuthTokenCurrent(data as never, emulation, { id: 'user-1', authGeneration: 1 }),
        ).resolves.toBe(false)
      })

      it('is refused once its session ends (endEmulation, admin session revocation)', async () => {
        data.userSession.findUnique.mockResolvedValue({ isValid: false, userId: 'admin-1' })
        await expect(isAuthTokenCurrent(data as never, emulation, user)).resolves.toBe(false)
      })

      it('is refused when its session belongs to the emulated user rather than the admin', async () => {
        data.userSession.findUnique.mockResolvedValue({ isValid: true, userId: 'user-1' })
        await expect(isAuthTokenCurrent(data as never, emulation, user)).resolves.toBe(false)
      })

      it('is refused when the admin no longer exists', async () => {
        data.user.findUnique.mockResolvedValue(null)
        await expect(isAuthTokenCurrent(data as never, emulation, user)).resolves.toBe(false)
      })
    })
  })
})
