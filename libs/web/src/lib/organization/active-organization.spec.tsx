import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gql } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { makeClient } from '@nestled-template/shared/apollo'
import { AuthProvider, useAuth, type AuthContextType } from '../contexts/auth.context'
import { isOrganizationSwitchSuperseded } from './switch-active-organization'

// The organizations query, cut down to what the provider reads; the switch mutation is the real one.
vi.mock('@nestled-template/shared/sdk', async importOriginal => ({
  ...(await importOriginal<typeof import('@nestled-template/shared/sdk')>()),
  MyOrganizationsWithMembers: gql`
    query myOrganizationsWithMembers {
      myOrganizations {
        id
        name
      }
    }
  `,
}))

const PROBE = gql`
  query Probe {
    probe
  }
`

const API_URL = 'https://api.example.com/graphql'
const STORAGE_KEY = 'activeOrganizationId'

/**
 * A fake API whose switch answers only when the test says so, and which records each request's
 * `x-organization-id`.
 */
function fakeApi() {
  const api = {
    switchRequests: [] as string[],
    probeHeaders: [] as Array<string | undefined>,
    answerSwitch: () => undefined as void,
  }
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const { operationName, variables } = JSON.parse(String(init?.body))
      const headers = (init?.headers ?? {}) as Record<string, string>
      switch (operationName) {
        case 'myOrganizationsWithMembers':
          return json({
            data: {
              myOrganizations: [
                { __typename: 'Organization', id: 'org-1', name: 'First Org' },
                { __typename: 'Organization', id: 'org-2', name: 'Second Org' },
              ],
            },
          })
        case 'switchActiveOrganization': {
          const organizationId = variables.input.organizationId as string
          api.switchRequests.push(organizationId)
          // Held until the test answers it: the late response.
          await new Promise<void>(resolve => {
            api.answerSwitch = resolve
          })
          return json({
            data: {
              switchActiveOrganization: {
                __typename: 'User',
                id: 'user-1',
                activeOrganizationId: organizationId,
              },
            },
          })
        }
        case 'Probe':
          api.probeHeaders.push(headers['x-organization-id'])
          return json({ data: { probe: true } })
        default:
          throw new Error(`unexpected operation ${operationName}`)
      }
    }),
  )
  return api
}

/** The provider for user-1, whose server knows no active organization, so the stored one is restored. */
function renderProvider(initialUser = { id: 'user-1', activeOrganizationId: null }) {
  const client = makeClient(undefined, { apiUrl: API_URL })
  const refetchQueries = vi.spyOn(client, 'refetchQueries')
  const auth: { current: AuthContextType | null } = { current: null }
  function Probe() {
    auth.current = useAuth()
    return null
  }
  const view = render(
    <ApolloProvider client={client}>
      <AuthProvider initialUser={initialUser as never}>
        <Probe />
      </AuthProvider>
    </ApolloProvider>,
  )
  return { client, auth, refetchQueries, view }
}

/** What the Apollo cache holds for user-1 (the switch's answer, once written). */
function cachedUser(client: ReturnType<typeof makeClient>) {
  return (client.cache.extract() as Record<string, unknown>)['User:user-1']
}

/** The next request's `x-organization-id`, as the app client sends it. */
async function nextRequestOrganization(
  client: ReturnType<typeof makeClient>,
  api: ReturnType<typeof fakeApi>,
) {
  await client.query({ query: PROBE, fetchPolicy: 'network-only' })
  return api.probeHeaders[api.probeHeaders.length - 1]
}

async function answerSwitch(api: ReturnType<typeof fakeApi>) {
  await act(async () => {
    api.answerSwitch()
    // Let the response travel through the link chain and the restore finish.
    await new Promise(resolve => setTimeout(resolve, 20))
  })
}

describe('a switch answered after its session ended', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, 'org-2')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('logout while the restore is pending: storage stays clear and the next request has no organization', async () => {
    const api = fakeApi()
    const { client, auth, refetchQueries } = renderProvider()
    await waitFor(() => expect(api.switchRequests).toEqual(['org-2']))

    act(() => auth.current?.logout())
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    await answerSwitch(api)

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(await nextRequestOrganization(client, api)).toBeUndefined()
    // Not cached for the ended session, and nothing refreshed for it.
    expect(cachedUser(client)).toBeUndefined()
    expect(refetchQueries).not.toHaveBeenCalled()
    expect(auth.current?.user).toBeNull()
  })

  it('a user change while the restore is pending: the new user’s organization is not overwritten', async () => {
    const api = fakeApi()
    const { client, auth, refetchQueries } = renderProvider()
    await waitFor(() => expect(api.switchRequests).toEqual(['org-2']))

    // Another user signs in without a logout in between; the server knows their organization.
    act(() => auth.current?.login({ id: 'user-2', activeOrganizationId: 'org-1' } as never))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('org-1')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await answerSwitch(api)

    // Not even for a moment: a re-render stores the shown organization again, but requests sent
    // before it would have gone out for the previous user's.
    expect(setItem).not.toHaveBeenCalledWith(STORAGE_KEY, 'org-2')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('org-1')
    expect(auth.current?.activeOrganization?.id).toBe('org-1')
    expect(auth.current?.user?.activeOrganizationId).toBe('org-1')
    expect(await nextRequestOrganization(client, api)).toBe('org-1')
    expect(cachedUser(client)).toBeUndefined()
    expect(refetchQueries).not.toHaveBeenCalled()
  })

  it('unmount while the restore is pending: nothing is written', async () => {
    const api = fakeApi()
    const { client, refetchQueries, view } = renderProvider()
    await waitFor(() => expect(api.switchRequests).toEqual(['org-2']))

    view.unmount()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await answerSwitch(api)

    expect(setItem).not.toHaveBeenCalled()
    expect(cachedUser(client)).toBeUndefined()
    expect(refetchQueries).not.toHaveBeenCalled()
  })

  it('AuthProvider.switchOrganization answered after logout: no user comes back, nothing is stored', async () => {
    const api = fakeApi()
    localStorage.setItem(STORAGE_KEY, 'org-1')
    const { client, auth } = renderProvider({
      id: 'user-1',
      activeOrganizationId: 'org-1',
    } as never)
    await waitFor(() => expect(auth.current?.isLoading).toBe(false))

    let outcome: Promise<unknown> | undefined
    act(() => {
      outcome = auth.current?.switchOrganization('org-2').then(
        () => 'resolved',
        (error: unknown) => error,
      )
    })
    await waitFor(() => expect(api.switchRequests).toEqual(['org-2']))
    act(() => auth.current?.logout())
    await answerSwitch(api)

    expect(auth.current?.user).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    // It rejects (so a switcher does not reload for it), as a dropped answer, not a failure.
    expect(isOrganizationSwitchSuperseded(await outcome)).toBe(true)
    expect(await nextRequestOrganization(client, api)).toBeUndefined()
  })

  it('a switch answered while its session is current is stored and cached as before', async () => {
    const api = fakeApi()
    const { client, auth, refetchQueries } = renderProvider()
    await waitFor(() => expect(api.switchRequests).toEqual(['org-2']))

    await answerSwitch(api)

    await waitFor(() => expect(auth.current?.activeOrganization?.id).toBe('org-2'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('org-2')
    expect(cachedUser(client)).toMatchObject({ activeOrganizationId: 'org-2' })
    expect(refetchQueries).toHaveBeenCalledWith({ include: 'active' })
  })
})
