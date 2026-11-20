import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation } from '@apollo/client/react'
import {
  __resetActiveOrganizationSessionChange,
  getStoredActiveOrganizationId,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import { useActiveOrganization } from '../organization/active-organization'
import { EmulationBanner } from './emulation-banner'

vi.mock('@apollo/client/react', () => ({ useMutation: vi.fn(), useApolloClient: () => ({}) }))
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
    __resetActiveOrganizationSessionChange()
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

  it("does not let the still-mounted shell write the emulated user's organization back before the reload", async () => {
    const organizations = [{ id: 'emulated-users-org' }]
    // The signed-in shell, as the layout runs it: it stores the organization it shows on every
    // render. `renders` changes to re-render it while the reload is pending, as the mutation's
    // answer reaching the cache does.
    function Shell({ renders }: { renders: number }) {
      const { activeOrganization } = useActiveOrganization(organizations, 'emulated-users-org', {
        sessionKey: 'emulated-user',
      })
      return <p data-renders={renders}>{activeOrganization?.id}</p>
    }
    const page = (renders: number) => (
      <>
        <Shell renders={renders} />
        <EmulationBanner />
      </>
    )
    const { rerender } = render(page(0))
    expect(getStoredActiveOrganizationId()).toBe('emulated-users-org')

    await userEvent.click(screen.getByRole('button', { name: /Exit Emulation/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'End Emulation' }))
    await waitFor(() => expect(globalThis.location.href).toBe('/admin/users'))

    // The document has not unloaded yet: the shell renders again.
    rerender(page(1))
    rerender(page(2))

    // The admin's session loads with nothing stored, so it sends and restores no organization of
    // the emulated user's.
    expect(getStoredActiveOrganizationId()).toBeNull()
    expect(localStorage.getItem('activeOrganizationId')).toBeNull()
  })
})
