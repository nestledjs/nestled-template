import type { ReactNode } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gql } from '@apollo/client'
import { ApolloProvider, createQueryPreloader, useQuery } from '@apollo/client/react'
import { makeClient } from '@nestled-template/shared/apollo'
import { Me } from '@nestled-template/shared/sdk'
import { useGlobalCtx } from '@nestled-template/web'
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
    refuseSwitch: false,
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
          if (api.refuseSwitch) {
            return json({
              data: null,
              errors: [{ message: 'No', extensions: { code: 'FORBIDDEN' } }],
            })
          }
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
  const { user, activeOrganization } = useGlobalCtx()
  return (
    <>
      <p>Page: {data?.organizationData ?? 'loading'}</p>
      {/* The two organization ids the shell hands its pages, which must agree. */}
      <p>
        User active organization: {user?.activeOrganizationId ?? 'none'}; shown:{' '}
        {activeOrganization?.id ?? 'none'}
      </p>
    </>
  )
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

/**
 * A signed-in reload: the server renders the shell to HTML (it cannot see this browser's storage),
 * then the browser, which has `stored` in storage, hydrates it. Both render from the same loader
 * data, as the streamed query refs give them. Returns the hydration errors React reported.
 */
// Hydrated roots, unmounted after each test: Testing Library's cleanup does not know about them.
const hydratedRoots: Root[] = []

async function reloadAndHydrate(stored: string | null) {
  const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
  const preload = createQueryPreloader(client)
  const meQueryRef = preload(Me)
  const myOrganizationsQueryRef = preload(MY_ORGANIZATIONS_WITH_MEMBERS)
  await preload.toPromise(meQueryRef)
  await preload.toPromise(myOrganizationsQueryRef)
  const routes = [
    {
      id: 'root',
      path: '/',
      loader: () => ({ meQueryRef }),
      element: <App />,
      children: [
        {
          id: 'members',
          path: 'members',
          loader: () => ({ myOrganizationsQueryRef }),
          element: <AuthenticatedLayout />,
          children: [{ index: true, element: <OrganizationPage /> }],
        },
      ],
    },
  ]
  const hydrationData = {
    loaderData: { root: { meQueryRef }, members: { myOrganizationsQueryRef } },
  }
  const tree = () => (
    <ApolloProvider client={client}>
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ['/members'], hydrationData })}
      />
    </ApolloProvider>
  )

  localStorage.clear()
  const container = document.createElement('div')
  container.innerHTML = renderToString(tree())
  document.body.appendChild(container)
  const serverHtml = container.innerHTML
  const serverText = container.textContent ?? ''

  if (stored) localStorage.setItem('activeOrganizationId', stored)
  const hydrationErrors: unknown[] = []
  let firstClientHtml = ''
  await act(async () => {
    hydratedRoots.push(
      hydrateRoot(container, tree(), {
        onRecoverableError: error => hydrationErrors.push(error),
      }),
    )
    // What the hydrating render committed, before anything after hydration ran.
    firstClientHtml = container.innerHTML
  })
  return { serverHtml, serverText, firstClientHtml, hydrationErrors }
}

describe('the active organization across a server render and hydration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    act(() => {
      for (const root of hydratedRoots.splice(0)) root.unmount()
    })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('hydrates with the server’s choice, then restores the stored organization through the switch', async () => {
    // No active organization on the server; this browser chose the second one.
    const api = fakeApi(null)

    const { serverHtml, serverText, firstClientHtml, hydrationErrors } =
      await reloadAndHydrate('org-2')

    // The server could only pick the first, and hydration agreed with it.
    expect(serverText).toContain('Shown organization: First Org')
    expect(hydrationErrors).toEqual([])
    expect(firstClientHtml).toBe(serverHtml)

    // After hydration: the stored choice is made active on the server, and the screen and the next
    // request follow it. No page request went out for the first organization meanwhile.
    await act(async () => {
      await vi.waitFor(() => expect(screen.getByText('Page: data for org-2')).toBeInTheDocument())
    })
    expect(screen.getByText('Shown organization: Second Org')).toBeInTheDocument()
    expect(api.activeOrganizationId).toBe('org-2')
    expect(pageRequestOrganization(api)).toBe('org-2')
    expect(localStorage.getItem('activeOrganizationId')).toBe('org-2')
    // The user the shell hands its pages follows the restore: Me's own active organization.
    expect(screen.getByText('User active organization: org-2; shown: org-2')).toBeInTheDocument()
  })

  it('keeps the server’s choice, and stores it, when the switch to the stored one is refused', async () => {
    const api = fakeApi(null)
    api.refuseSwitch = true

    const { hydrationErrors } = await reloadAndHydrate('org-2')

    expect(hydrationErrors).toEqual([])
    await act(async () => {
      await vi.waitFor(() => expect(screen.getByText('Page: data for org-1')).toBeInTheDocument())
    })
    expect(screen.getByText('Shown organization: First Org')).toBeInTheDocument()
    expect(pageRequestOrganization(api)).toBe('org-1')
    expect(localStorage.getItem('activeOrganizationId')).toBe('org-1')
  })

  it('hydrates without a reconciliation when the server knows the active organization', async () => {
    const api = fakeApi('org-2')

    const { serverHtml, serverText, firstClientHtml, hydrationErrors } =
      await reloadAndHydrate('org-1')

    expect(hydrationErrors).toEqual([])
    expect(firstClientHtml).toBe(serverHtml)
    expect(serverText).toContain('Page: ')
    await act(async () => {
      await vi.waitFor(() => expect(screen.getByText('Page: data for org-2')).toBeInTheDocument())
    })
    expect(api.organizationHeaders.some(r => r.operation === 'switchActiveOrganization')).toBe(
      false,
    )
  })
})

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
    expect(screen.getByText('User active organization: org-2; shown: org-2')).toBeInTheDocument()
  })

  it('after a recovery with no server organization, the re-checked user follows the restore', async () => {
    // The re-checked user is a snapshot (no-cache); the restore still has to reach it.
    localStorage.setItem('activeOrganizationId', 'org-2')
    const api = fakeApi(null)

    await renderShell({ rootPreloadsMe: false })

    expect(screen.getByText('Shown organization: Second Org')).toBeInTheDocument()
    expect(pageRequestOrganization(api)).toBe('org-2')
    // Not a matter of time: the root loader here never brings a Me, so the snapshot stays.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(screen.getByText('User active organization: org-2; shown: org-2')).toBeInTheDocument()
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
