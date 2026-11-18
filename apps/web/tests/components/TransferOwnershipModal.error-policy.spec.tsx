import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { makeClient } from '@nestled-template/shared/apollo'
import { Me } from '@nestled-template/shared/sdk'
import { TransferOwnershipModal } from '@nestled-template/web'

// Only the queries are stubbed: the transfer runs through a real `useMutation` on a client with the
// app's defaults, so a GraphQL refusal behaves here as it does in the app.
const mockUseQuery = vi.fn()
vi.mock('@apollo/client/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@apollo/client/react')>()
  return { ...actual, useQuery: (...args: unknown[]) => mockUseQuery(...args) }
})

function closestSelect(element: HTMLElement): HTMLSelectElement {
  const select = element.closest('select')
  if (!(select instanceof HTMLSelectElement)) {
    throw new TypeError('Expected element to be inside a select')
  }
  return select
}

const currentUser = { id: 'user-1', firstName: 'John', lastName: 'Doe' }
const organizations = [
  {
    id: 'org-1',
    name: 'Acme Corp',
    members: [
      { id: 'member-1', role: { name: 'Owner' }, user: currentUser },
      {
        id: 'member-2',
        role: { name: 'Admin' },
        user: { id: 'user-2', firstName: 'Jane', lastName: 'Smith' },
      },
    ],
  },
]

function renderModal(result: ApolloLink.Result) {
  const link = new ApolloLink(
    () =>
      new Observable<ApolloLink.Result>(observer => {
        observer.next(result)
        observer.complete()
      }),
  )
  // The app client's real defaults (`makeClient`): the modal must treat a refusal as a failure.
  const client = new ApolloClient({
    link,
    cache: new InMemoryCache(),
    defaultOptions: makeClient(undefined, { apiUrl: 'http://localhost:3000/graphql' })
      .defaultOptions,
  })
  const onClose = vi.fn()
  const onSuccess = vi.fn()
  render(
    <ApolloProvider client={client}>
      <TransferOwnershipModal isOpen onClose={onClose} onSuccess={onSuccess} />
    </ApolloProvider>,
  )
  return { onClose, onSuccess }
}

async function submitTransfer() {
  const user = userEvent.setup()
  await user.selectOptions(closestSelect(screen.getByText('Choose an organization...')), 'org-1')
  await user.selectOptions(closestSelect(await screen.findByText('Choose new owner...')), 'user-2')
  await user.type(await screen.findByPlaceholderText('Type TRANSFER to confirm'), 'TRANSFER')
  await user.click(screen.getByRole('button', { name: 'Transfer Ownership' }))
}

describe('TransferOwnershipModal under the app client error policy', () => {
  const alert = vi.fn()

  beforeEach(() => {
    alert.mockReset()
    vi.stubGlobal('alert', alert)
    mockUseQuery.mockImplementation((query: unknown) =>
      query === Me
        ? { data: { me: currentUser }, loading: false }
        : { data: { myOrganizations: organizations }, loading: false },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the failure and stays open when the API refuses the transfer', async () => {
    const { onClose, onSuccess } = renderModal({
      data: null,
      errors: [{ message: 'Nope', extensions: { code: 'BAD_USER_INPUT' } }],
    } as never)

    await submitTransfer()

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Failed to transfer ownership: Nope'))
    expect(alert).not.toHaveBeenCalledWith('Organization ownership transferred successfully!')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reports success and closes when the API accepts the transfer', async () => {
    const { onClose, onSuccess } = renderModal({
      data: { transferOrganizationOwnership: true },
    })

    await submitTransfer()

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Organization ownership transferred successfully!'),
    )
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
