import React, { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApolloClient, ApolloLink, gql, InMemoryCache, Observable } from '@apollo/client'
import { ApolloProvider, useMutation } from '@apollo/client/react'
import { makeClient } from '@nestled-template/shared/apollo'
import { EmulationBanner } from '@nestled-template/web'

const mockUseGlobalCtx = vi.fn()
vi.mock('../../../libs/web/src/lib/contexts', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../libs/web/src/lib/contexts')>()
  return { ...actual, useGlobalCtx: () => mockUseGlobalCtx() }
})

const REFUSAL: ApolloLink.Result = {
  data: null,
  errors: [{ message: 'You cannot do that here', extensions: { code: 'FORBIDDEN' } }],
}

/** A client with the app's real defaults (`makeClient`) that answers every request with `result`. */
function clientAnswering(result: ApolloLink.Result) {
  const link = new ApolloLink(
    () =>
      new Observable<ApolloLink.Result>(observer => {
        observer.next(result)
        observer.complete()
      }),
  )
  return new ApolloClient({
    link,
    cache: new InMemoryCache(),
    defaultOptions: makeClient(undefined, { apiUrl: 'http://localhost:3000/graphql' })
      .defaultOptions,
  })
}

const RENAME = gql`
  mutation Rename {
    rename
  }
`

/**
 * The most common caller shape, here and downstream: `useMutation` with no `errorPolicy`, an
 * awaited call and a `try/catch`. Under a mutation default of `'all'` a refusal resolved, so this
 * shape showed "Saved" for a write the API refused.
 */
function TypicalForm() {
  const [rename] = useMutation(RENAME)
  const [status, setStatus] = useState<string | null>(null)
  return (
    <form
      onSubmit={async event => {
        event.preventDefault()
        try {
          await rename()
          setStatus('Saved')
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Failed')
        }
      }}
    >
      <button type="submit">Save</button>
      {status && <p role="status">{status}</p>}
    </form>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('mutation callers under the app client defaults', () => {
  it('a try/catch caller with no errorPolicy shows the API message, not success', async () => {
    render(
      <ApolloProvider client={clientAnswering(REFUSAL)}>
        <TypicalForm />
      </ApolloProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('You cannot do that here')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('the same caller still reports success when the API accepts', async () => {
    render(
      <ApolloProvider client={clientAnswering({ data: { rename: true } })}>
        <TypicalForm />
      </ApolloProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('an onError caller (the emulation banner) shows the API message and stays put', async () => {
    mockUseGlobalCtx.mockReturnValue({ user: { id: 'user-1', isEmulating: true } })
    const hrefBefore = globalThis.location.href
    render(
      <ApolloProvider client={clientAnswering(REFUSAL)}>
        <EmulationBanner />
      </ApolloProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /exit emulation/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'End Emulation' }))

    await waitFor(() => expect(screen.getByText('You cannot do that here')).toBeInTheDocument())
    expect(globalThis.location.href).toBe(hrefBefore)
  })
})
