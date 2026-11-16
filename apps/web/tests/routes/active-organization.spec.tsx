import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gql } from '@apollo/client'
import { ApolloProvider, createQueryPreloader, useQuery } from '@apollo/client/react'
import { makeClient } from '@nestled-template/shared/apollo'
import { Me } from '@nestled-template/shared/sdk'
import { App } from '../../app/app'
import AuthenticatedLayout from '../../app/routes/_authenticated/_layout'
import { OrganizationRequired } from '../../app/organization-required'

// The header shows the organization the shell picked; nothing else of the chrome is under test.
vi.mock('@nestled-template/web-ui', () => ({
  WebUiHeader: ({ siteName }: { siteName: string }) => <p>Shown organization: {siteName}</p>,
  WebUiFooter: () => null,
}))
vi.mock('@nestled-template/web', async importOriginal => ({
  ...(await importOriginal<typeof import('@nestled-template/web')>()),
  SubscriptionProvider: ({ children }: { children: ReactNode }) => children,
  SubscriptionStatusBanner: () => null,
  EmulationBanner: () => null,
}))

const MY_ORGANIZATIONS_WITH_MEMBERS = gql`
  query myOrganizationsWithMembers {
    myOrganizations {
      id
      name
    }
  }
`
const ORGANIZATION_DATA = gql`
  query OrganizationData {
    organizationData
  }
`

// "First" is listed first on purpose: the shell used to fall back to it whatever was active.
const ORGANIZATIONS = [
  { __typename: 'Organization', id: 'org-1', name: 'First Org' },
  { __typename: 'Organization', id: 'org-2', name: 'Second Org' },
]

/** A fake API: the user's active organization, and every request's x-organization-id. */
function fakeApi(initialActiveOrganizationId: string | null) {
  const api = {
    activeOrganizationId: initialActiveOrganizationId,
    organizationHeaders: [] as Array<{ operation: string; organization: string | undefined }>,
  }
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  // Every field of the app's own Me document, so the root loader's cached Me is complete.
  const me = () => ({
    __typename: 'User',
    id: 'user-1',
    firstName: 'Ada',
    lastName: null,
    displayName: null,
    bio: null,
    isSuperAdmin: false,
    emailValidated: true,
    twoFactorEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isEmulating: false,
    originalAdminId: null,
    activeOrganizationId: api.activeOrganizationId,
    emails: [],
    phoneNumbers: [],
    avatar: null,
    images: [],
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const { operationName, variables } = JSON.parse(String(init?.body))
      const headers = (init?.headers ?? {}) as Record<string, string>
      api.organizationHeaders.push({
        operation: operationName,
        organization: headers['x-organization-id'],
      })
      switch (operationName) {
        case 'Me':
          return json({ data: { me: me() } })
        case 'myOrganizations':
        case 'myOrganizationsWithMembers':
          return json({ data: { myOrganizations: ORGANIZATIONS } })
        case 'switchActiveOrganization':
          api.activeOrganizationId = variables.input.organizationId
          return json({
            data: {
              switchActiveOrganization: {
                __typename: 'User',
                id: 'user-1',
                activeOrganizationId: api.activeOrganizationId,
              },
            },
          })
        case 'OrganizationData':
          return json({ data: { organizationData: `data for ${headers['x-organization-id']}` } })
        default:
          throw new Error(`unexpected operation ${operationName}`)
      }
    }),
  )
  return api
}

function OrganizationPage() {
  const { data } = useQuery<{ organizationData: string }>(ORGANIZATION_DATA)
  return <p>Page: {data?.organizationData ?? 'loading'}</p>
}

/**
 * The signed-in shell. `rootPreloadsMe: false` is the recovery path: the root loader brings no Me
 * (a preload that failed), so the layout's re-check finds the user.
 */
async function renderShell({ rootPreloadsMe }: { rootPreloadsMe: boolean }) {
  const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
  const preload = createQueryPreloader(client)
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: async () => {
          if (!rootPreloadsMe) return {}
          const meQueryRef = preload(Me)
          await preload.toPromise(meQueryRef)
          return { meQueryRef }
        },
        element: <App />,
        children: [
          {
            path: 'members',
            loader: async () => {
              const myOrganizationsQueryRef = preload(MY_ORGANIZATIONS_WITH_MEMBERS, {
                fetchPolicy: 'network-only',
              })
              await preload.toPromise(myOrganizationsQueryRef)
              return { myOrganizationsQueryRef }
            },
            element: <AuthenticatedLayout />,
            children: [{ index: true, element: <OrganizationPage /> }],
          },
        ],
      },
    ],
    { initialEntries: ['/members'] },
  )
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <RouterProvider router={router} />
      </ApolloProvider>,
    )
  })
  await act(async () => {
    await vi.waitFor(() => expect(screen.getByText(/^Page: data for/)).toBeInTheDocument())
  })
}

/** The organization of the page's own request: the next request after the shell rendered. */
function pageRequestOrganization(api: ReturnType<typeof fakeApi>) {
  return api.organizationHeaders.find(request => request.operation === 'OrganizationData')
    ?.organization
}

describe('the active organization: what the shell shows and what the requests are sent for', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('after a recovery, shows and sends the active organization the re-check learned, not the first', async () => {
    // The browser still holds the first organization; the server's active one is the second.
    localStorage.setItem('activeOrganizationId', 'org-1')
    const api = fakeApi('org-2')

    await renderShell({ rootPreloadsMe: false })

    expect(screen.getByText('Shown organization: Second Org')).toBeInTheDocument()
    expect(pageRequestOrganization(api)).toBe('org-2')
    expect(screen.getByText('Page: data for org-2')).toBeInTheDocument()
    expect(localStorage.getItem('activeOrganizationId')).toBe('org-2')
  })

  it('with nothing stored, shows and sends the server’s active organization', async () => {
    const api = fakeApi('org-2')

    await renderShell({ rootPreloadsMe: true })

    expect(screen.getByText('Shown organization: Second Org')).toBeInTheDocument()
    expect(pageRequestOrganization(api)).toBe('org-2')
  })

  it('with no active organization on the server, keeps the one this browser chose', async () => {
    localStorage.setItem('activeOrganizationId', 'org-2')
    const api = fakeApi(null)

    await renderShell({ rootPreloadsMe: true })

    expect(screen.getByText('Shown organization: Second Org')).toBeInTheDocument()
    expect(pageRequestOrganization(api)).toBe('org-2')
  })

  it('after a picker choice and the reload, shows and sends the chosen organization', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...globalThis.location, reload })
    const api = fakeApi(null)
    const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
    const picker = render(
      <ApolloProvider client={client}>
        <MemoryRouter>
          <OrganizationRequired />
        </MemoryRouter>
      </ApolloProvider>,
    )
    const second = await screen.findByRole('button', { name: 'Second Org' })
    await act(async () => {
      fireEvent.click(second)
    })
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    // One switch: the server and the stored id both moved to the choice before the reload.
    expect(api.activeOrganizationId).toBe('org-2')
    expect(localStorage.getItem('activeOrganizationId')).toBe('org-2')
    picker.unmount()

    // The reload: a fresh app, Me preloaded by the root loader.
    api.organizationHeaders.length = 0
    await renderShell({ rootPreloadsMe: true })

    expect(screen.getByText('Shown organization: Second Org')).toBeInTheDocument()
    expect(pageRequestOrganization(api)).toBe('org-2')
  })
})
