import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { ApolloProvider, useQuery } from '@apollo/client/react'
import {
  createMemoryRouter,
  createRoutesStub,
  Link,
  Outlet,
  RouterProvider,
  useLoaderData,
  useRevalidator,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetActiveOrganizationSessionChange,
  ACTIVE_ORGANIZATION_STORAGE_KEY,
  clearActiveOrganizationForSessionChange,
  makeClient,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import { UserPreferences, type UserPreferencesQuery } from '@nestled-template/shared/sdk'
import { SessionUserGuard, type AppSessionVerdict } from '../../app/session'
import { __resetSessionUserGuard, LEAVING_GRACE_MS } from '../../app/session/session-user-guard'
import App from '../../app/app'
import { Layout } from '../../app/root'
import LogoutRoute from '../../app/routes/logout'
import NotificationsSettings from '../../app/routes/settings/notifications'
import { stubLocation } from '../helpers/location'
import { NO_SESSION, REJECTED, TEST_USER, UNKNOWN } from '../helpers/session-context'

// Cached data must not outlive the identity it was read for. The app's real client (makeClient, on its
// real InMemoryCache) holds the first user's data; the root loader's verdict then names
// another user, as a navigation or revalidation does once the cookie changed under the tab. The
// second user's own requests are held, refused or answered: nothing of the first user may render.

const USER_A: AppSessionVerdict = { kind: 'signed-in', user: { ...TEST_USER, id: 'user-a' } }
const USER_B: AppSessionVerdict = { kind: 'signed-in', user: { ...TEST_USER, id: 'user-b' } }

// A turned this switch on; the defaults leave it off.
const A_ONLY_SWITCH = 'notif_newsletters'
const A_ONLY_TITLE = 'Newsletters'

function preferences(userId: string, value: string): UserPreferencesQuery {
  return {
    __typename: 'Query',
    userPreferences: [
      {
        __typename: 'UserPreference',
        id: `preference-${userId}`,
        key: A_ONLY_SWITCH,
        value,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        userId,
      },
    ],
  } as unknown as UserPreferencesQuery
}

type Answer = 'answer-a' | 'hold' | 'fail'

let answer: Answer
let requests: number

/** The API as the browser reaches it. Counts the UserPreferences requests only. */
async function fetchFromApi(_uri: unknown, init?: RequestInit): Promise<Response> {
  const { operationName } = JSON.parse(String(init?.body)) as { operationName?: string }
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  if (operationName === 'Logout') return json({ data: { logout: true } })
  if (operationName !== 'UserPreferences') return json({ data: null })
  requests += 1
  if (answer === 'hold') return new Promise<Response>(() => undefined)
  if (answer === 'fail') throw new TypeError('Failed to fetch')
  return json({ data: preferences('user-a', 'true') })
}

let verdict: AppSessionVerdict

/** Every value of the switch that was ever put on screen, however briefly, after `mark()`. */
let rendered: string[] = []

function Probe() {
  const { data } = useQuery(UserPreferences)
  for (const preference of data?.userPreferences ?? []) rendered.push(preference.id)
  return null
}

function Root() {
  const { session } = useLoaderData() as { session: AppSessionVerdict }
  return (
    <SessionUserGuard session={session}>
      <App />
    </SessionUserGuard>
  )
}

function Page({ name }: Readonly<{ name: string }>) {
  return (
    <main>
      <h1>{name}</h1>
      <Link to="/settings/notifications">Notifications</Link>
      <Outlet />
    </main>
  )
}

async function renderApp(initial = '/settings/notifications') {
  const client = makeClient(undefined, { apiUrl: 'https://api.example.com/graphql' })
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        path: '/',
        loader: () => ({ session: verdict }),
        // As in a deployed app, where every client navigation runs the root loader again.
        shouldRevalidate: () => true,
        element: <Root />,
        children: [
          {
            path: 'settings/notifications',
            element: (
              <>
                <Probe />
                <NotificationsSettings />
              </>
            ),
          },
          { path: 'settings/profile', element: <Page name="Profile" /> },
          { path: 'login', element: <Page name="Log in" /> },
          { path: 'logout', element: <LogoutRoute /> },
        ],
      },
    ],
    { initialEntries: [initial] },
  )
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <RouterProvider router={router} />
      </ApolloProvider>,
    )
  })
  return { router, client }
}

async function showsUserA() {
  await waitFor(() => expect(rendered).toContain('preference-user-a'))
  expect(screen.getByText(A_ONLY_TITLE)).toBeInTheDocument()
  rendered = []
}

let location: ReturnType<typeof stubLocation>

beforeEach(() => {
  __resetSessionUserGuard()
  __resetActiveOrganizationSessionChange()
  localStorage.clear()
  location = stubLocation()
  vi.stubGlobal('fetch', vi.fn(fetchFromApi))
  verdict = USER_A
  answer = 'answer-a'
  requests = 0
  rendered = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  __resetSessionUserGuard()
  __resetActiveOrganizationSessionChange()
  localStorage.clear()
})

describe('cached data does not outlive the user it was read for', () => {
  it.each(['hold', 'fail'] as const)(
    "another user's verdict on a navigation renders nothing and loads the document once (their request: %s)",
    async how => {
      const { router } = await renderApp()
      await showsUserA()
      await act(() => router.navigate('/settings/profile'))
      expect(location.reload).not.toHaveBeenCalled()

      verdict = USER_B
      answer = how
      const before = requests
      await act(() => router.navigate('/settings/notifications'))

      expect(rendered).toEqual([])
      expect(screen.queryByText(A_ONLY_TITLE)).not.toBeInTheDocument()
      expect(document.body.textContent).toBe('')
      // Not even a request: the new document makes its own.
      expect(requests).toBe(before)
      expect(location.reload).toHaveBeenCalledTimes(1)
    },
  )

  it('a revalidation that names another user renders nothing and loads the document once', async () => {
    const { router } = await renderApp()
    await showsUserA()

    verdict = USER_B
    answer = 'hold'
    await act(() => router.revalidate())
    await act(() => router.revalidate())
    await act(() => router.navigate('/settings/profile'))

    expect(rendered).toEqual([])
    expect(document.body.textContent).toBe('')
    expect(location.reload).toHaveBeenCalledTimes(1)
  })

  it('stays blocked while the document load is on its way, even if the first user comes back', async () => {
    const { router } = await renderApp()
    await showsUserA()
    verdict = USER_B
    await act(() => router.revalidate())
    verdict = USER_A
    await act(() => router.revalidate())

    expect(document.body.textContent).toBe('')
    expect(location.reload).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no session', NO_SESSION],
    ['a rejected session', REJECTED],
    ['an unknown verdict', UNKNOWN],
  ])('%s in between does not reset the memory of the last user', async (_label, between) => {
    const { router } = await renderApp()
    await showsUserA()
    verdict = between
    await act(() => router.navigate('/login'))
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(location.reload).not.toHaveBeenCalled()

    verdict = USER_B
    answer = 'hold'
    await act(() => router.navigate('/settings/notifications'))

    expect(rendered).toEqual([])
    expect(document.body.textContent).toBe('')
    expect(location.reload).toHaveBeenCalledTimes(1)
  })

  it('forgets the organization stored for the first user, and stores it no more', async () => {
    storeActiveOrganizationId('org-of-user-a')
    const { router } = await renderApp()
    verdict = USER_B
    await act(() => router.revalidate())
    storeActiveOrganizationId('org-of-user-a')
    expect(localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)).toBeNull()
  })
})

describe('signing out, then another user', () => {
  it('empties the cache, and the next user still gets a document of their own', async () => {
    const { router, client } = await renderApp()
    await showsUserA()
    verdict = NO_SESSION
    await act(() => router.navigate('/logout'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(client.cache.extract()).toEqual({})

    verdict = USER_B
    answer = 'hold'
    await act(() => router.navigate('/settings/notifications'))
    expect(rendered).toEqual([])
    expect(document.body.textContent).toBe('')
    expect(location.reload).toHaveBeenCalledTimes(1)
  })

  it('holds even when the cache could not be emptied', async () => {
    const { router, client } = await renderApp()
    await showsUserA()
    vi.spyOn(client, 'clearStore').mockRejectedValue(new Error('not cleared'))
    verdict = NO_SESSION
    await act(() => router.navigate('/logout'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))

    verdict = USER_B
    answer = 'hold'
    await act(() => router.navigate('/settings/notifications'))
    expect(rendered).toEqual([])
    expect(document.body.textContent).toBe('')
  })
})

describe('the root Layout', () => {
  it('guards the whole document with the root loader verdict', async () => {
    function Content() {
      const { revalidate } = useRevalidator()
      return <button onClick={() => void revalidate()}>of the last user</button>
    }
    const judgeAgain = () =>
      act(async () => screen.getByRole('button', { name: 'of the last user' }).click())
    const Stub = createRoutesStub([
      {
        id: 'root',
        path: '/',
        loader: () => ({ theme: 'dark', session: verdict }),
        Component: () => (
          <Layout>
            <Content />
          </Layout>
        ),
      },
    ])
    await act(async () => {
      render(
        <ApolloProvider client={makeClient(undefined, { apiUrl: 'https://api.example.com' })}>
          <Stub initialEntries={['/']} />
        </ApolloProvider>,
      )
    })
    expect(await screen.findByText('of the last user')).toBeInTheDocument()
    await judgeAgain()
    expect(screen.getByText('of the last user')).toBeInTheDocument()

    verdict = USER_B
    await judgeAgain()
    await waitFor(() => expect(screen.queryByText('of the last user')).not.toBeInTheDocument())
    expect(location.reload).toHaveBeenCalledTimes(1)
  })
})

describe('the same user changes nothing', () => {
  it('through revalidations, navigations and signed-out verdicts', async () => {
    const { router } = await renderApp()
    await showsUserA()
    for (const next of [USER_A, NO_SESSION, USER_A, UNKNOWN, { ...USER_A }]) {
      verdict = next
      await act(() => router.revalidate())
    }
    await act(() => router.navigate('/settings/profile'))

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('a new document takes its first user, so a reload cannot loop', async () => {
    const { router } = await renderApp()
    verdict = USER_B
    await act(() => router.revalidate())
    expect(location.reload).toHaveBeenCalledTimes(1)

    // The document load: fresh module state, a fresh client, the same cookie.
    cleanup()
    __resetSessionUserGuard()
    __resetActiveOrganizationSessionChange()
    const fresh = await renderApp('/settings/profile')
    await act(() => fresh.router.revalidate())

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(location.reload).toHaveBeenCalledTimes(1)
  })
})

describe('a document already leaving for another session (sign-in, emulation start or end)', () => {
  it("is not loaded twice, and still renders nothing of the first user's", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { router } = await renderApp()
    await showsUserA()
    // What the emulation start, the emulation end and the sign-in do right before `location`.
    clearActiveOrganizationForSessionChange()

    verdict = USER_B
    answer = 'hold'
    await act(() => router.revalidate())
    await act(() => vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS - 1000))

    expect(rendered).toEqual([])
    expect(document.body.textContent).toBe('')
    expect(location.reload).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown verdict', UNKNOWN],
    ['a signed-out verdict', NO_SESSION],
    ['the first user again', USER_A],
  ])(
    'stays blank while that navigation is awaited, whatever comes next (%s)',
    async (_l, later) => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const { router } = await renderApp()
      await showsUserA()
      clearActiveOrganizationForSessionChange()
      verdict = USER_B
      answer = 'hold'
      await act(() => router.revalidate())
      expect(document.body.textContent).toBe('')

      verdict = later
      await act(() => router.revalidate())
      await act(() => router.navigate('/settings/profile'))
      await act(() => vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS - 1000))

      expect(rendered).toEqual([])
      expect(document.body.textContent).toBe('')
      expect(location.reload).not.toHaveBeenCalled()
      await act(() => vi.advanceTimersByTimeAsync(2000))
      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(document.body.textContent).toBe('')
    },
  )

  it('keeps the organization the next session stored meanwhile when it loads the document', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { router } = await renderApp()
    clearActiveOrganizationForSessionChange()
    verdict = USER_B
    await act(() => router.revalidate())
    // The next session's own document (this tab's navigation, or another tab) chose it.
    localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, 'org-of-user-b')
    await act(() => vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS + 1000))

    expect(location.reload).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)).toBe('org-of-user-b')
  })

  it('is loaded once if that navigation never happens, so the page cannot stay blank', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { router } = await renderApp()
    await showsUserA()
    clearActiveOrganizationForSessionChange()
    verdict = USER_B
    await act(() => router.revalidate())
    await act(() => router.revalidate())
    await act(() => vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS * 3))

    expect(location.reload).toHaveBeenCalledTimes(1)
  })
})
