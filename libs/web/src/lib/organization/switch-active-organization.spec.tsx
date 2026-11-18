import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { useSwitchActiveOrganization } from './switch-active-organization'

function renderSwitch(refuse: boolean) {
  const requested: string[] = []
  const link = new ApolloLink(
    operation =>
      new Observable<ApolloLink.Result>(observer => {
        const { organizationId } = operation.variables['input'] as { organizationId: string }
        requested.push(organizationId)
        observer.next(
          refuse
            ? ({ data: null, errors: [{ message: 'Not a member' }] } as never)
            : {
                data: {
                  switchActiveOrganization: {
                    __typename: 'User',
                    id: 'user-1',
                    activeOrganizationId: organizationId,
                  },
                },
              },
        )
        observer.complete()
      }),
  )
  // A client that defaults mutations to 'all' (as `makeClient` did before 2026.11.9, and as some
  // apps still do): the hook's own 'none' must still make a refusal throw.
  const client = new ApolloClient({
    link,
    cache: new InMemoryCache(),
    defaultOptions: { mutate: { errorPolicy: 'all' } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ApolloProvider client={client}>{children}</ApolloProvider>
  )
  const { result } = renderHook(() => useSwitchActiveOrganization(), { wrapper })
  return { switchOrganization: result.current, requested }
}

describe('useSwitchActiveOrganization', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('switches on the API, then stores the id the requests are sent for', async () => {
    const { switchOrganization, requested } = renderSwitch(false)

    let active: string | undefined
    await act(async () => {
      active = await switchOrganization('org-2')
    })

    expect(requested).toEqual(['org-2'])
    expect(active).toBe('org-2')
    expect(localStorage.getItem('activeOrganizationId')).toBe('org-2')
  })

  it('throws when the API refuses the switch, with nothing stored', async () => {
    localStorage.setItem('activeOrganizationId', 'org-1')
    const { switchOrganization } = renderSwitch(true)

    await act(async () => {
      await expect(switchOrganization('org-2')).rejects.toThrow('Not a member')
    })

    expect(localStorage.getItem('activeOrganizationId')).toBe('org-1')
  })
})
