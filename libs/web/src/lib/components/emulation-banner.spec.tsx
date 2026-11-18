import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation } from '@apollo/client/react'
import {
  getStoredActiveOrganizationId,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import { EmulationBanner } from './emulation-banner'

vi.mock('@apollo/client/react', () => ({ useMutation: vi.fn() }))
vi.mock('../contexts', () => ({
  useGlobalCtx: () => ({ user: { id: 'emulated-user', isEmulating: true } }),
}))

describe('EmulationBanner', () => {
  const originalLocation = globalThis.location

  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { href: '' },
    })
    // The mutation completes at once, as when the API ends the emulation.
    vi.mocked(useMutation).mockImplementation(((
      _document: unknown,
      options?: { onCompleted?: () => void },
    ) => [
      vi.fn(async () => {
        options?.onCompleted?.()
        return { data: {} }
      }),
      { loading: false },
    ]) as never)
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: originalLocation })
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("forgets the emulated user's organization before going back to the admin's session", async () => {
    storeActiveOrganizationId('emulated-users-org')
    render(<EmulationBanner />)

    await userEvent.click(screen.getByRole('button', { name: /Exit Emulation/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'End Emulation' }))

    await waitFor(() => expect(globalThis.location.href).toBe('/admin/users'))
    expect(getStoredActiveOrganizationId()).toBeNull()
  })
})
