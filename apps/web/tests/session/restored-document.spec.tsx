import { useEffect } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApolloProvider } from '@apollo/client/react'
import {
  createRoutesStub,
  data,
  Outlet,
  redirectDocument,
  useRevalidator,
  useRouteError,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetActiveOrganizationSessionChange,
  ACTIVE_ORGANIZATION_STORAGE_KEY,
  clearActiveOrganizationForSessionChange,
  makeClient,
  storeActiveOrganizationId,
} from '@nestled-template/shared/apollo'
import { ErrorBoundary, Layout } from '../../app/root'
import { OFFLINE_TITLE, SERVER_TROUBLE_TITLE } from '../../app/api-unavailable'
import { SESSION_UNKNOWN_TITLE } from '../../app/session/session-unknown'
import type { AppSessionVerdict } from '../../app/session'
import { __resetSessionUserGuard, RESTORE_CHECK_MS } from '../../app/session/session-user-guard'
import { stubLocation } from '../helpers/location'
import { NO_SESSION, TEST_USER, UNKNOWN } from '../helpers/session-context'

// A document restored from the back/forward cache, through the app's real Layout and root
// ErrorBoundary, which React Router renders around the page and around the error screen. The root
// loader stands for the session middleware: it answers with the verdict, or holds, or fails.

const USER_A: AppSessionVerdict = { kind: 'signed-in', user: { ...TEST_USER, id: 'user-a' } }
const USER_B: AppSessionVerdict = { kind: 'signed-in', user: { ...TEST_USER, id: 'user-b' } }

let verdict: AppSessionVerdict
let answer: () => Promise<void> | void
let checks: number
let location: ReturnType<typeof stubLocation>
/** The page's own revalidation, which outlives the page. */
let judgeAgain: () => Promise<void>

function Boundary() {
  return (
    <Layout>
      <ErrorBoundary error={useRouteError()} />
    </Layout>
  )
}

function Page({ name }: Readonly<{ name: string }>) {
  const { revalidate } = useRevalidator()
  useEffect(() => {
    judgeAgain = revalidate
  }, [revalidate])
  return (
    <>
      <h1>{name}</h1>
      <input aria-label="draft" />
    </>
  )
}

async function renderApp(initial = '/private') {
  const Stub = createRoutesStub([
    {
      id: 'root',
      path: '/',
      loader: async () => {
        checks += 1
        await answer()
        return { theme: 'dark', session: verdict }
      },
      Component: () => (
        <Layout>
          <Outlet />
        </Layout>
      ),
      ErrorBoundary: Boundary,
      children: [
        {
          path: 'private',
          loader: async () => {
            await answer()
            // requireSession's rule.
            if (verdict.kind === 'signed-out') throw redirectDocument('/login')
            if (verdict.kind === 'unknown') {
              throw data({ code: 'SESSION_UNKNOWN', reason: verdict.reason }, { status: 503 })
            }
            return null
          },
          Component: () => <Page name="Of user A" />,
        },
        { path: 'public', Component: () => <Page name="Of user A" /> },
      ],
    },
  ])
  await act(async () => {
    render(
      <ApolloProvider client={makeClient(undefined, { apiUrl: 'https://api.example.com' })}>
        <Stub initialEntries={[initial]} />
      </ApolloProvider>,
    )
  })
  await screen.findByRole('heading', { name: 'Of user A' })
  checks = 0
}

/** The event only: the document comes back exactly as it was. */
function restore(persisted = true) {
  const event = new Event('pageshow')
  Object.defineProperty(event, 'persisted', { value: persisted })
  globalThis.dispatchEvent(event)
}

function hold(): () => void {
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  answer = () => held
  return () => {
    answer = () => undefined
    release()
  }
}

const page = () => screen.queryByText('Of user A')

beforeEach(() => {
  __resetSessionUserGuard()
  __resetActiveOrganizationSessionChange()
  localStorage.clear()
  location = stubLocation()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubGlobal('fetch', () => new Promise(() => undefined))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  verdict = USER_A
  answer = () => undefined
  checks = 0
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  __resetSessionUserGuard()
  __resetActiveOrganizationSessionChange()
})

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('a document restored from the back/forward cache', () => {
  it('is hidden at once, and shown as it was left for the same user', async () => {
    await renderApp()
    await userEvent.type(screen.getByLabelText('draft'), 'half a sentence')
    expect(page()).toBeVisible()

    const release = hold()
    restore()
    // Synchronously: before the browser paints the restored page.
    expect(page()).not.toBeVisible()
    await wait(RESTORE_CHECK_MS / 2)
    expect(page()).not.toBeVisible()
    expect(page()).toBeInTheDocument()

    release()
    await waitFor(() => expect(page()).toBeVisible())
    expect(screen.getByLabelText('draft')).toHaveValue('half a sentence')
    expect(checks).toBe(1)
    await wait(RESTORE_CHECK_MS * 2)
    expect(page()).toBeVisible()
    expect(location.reload).not.toHaveBeenCalled()
    expect(location.assign).not.toHaveBeenCalled()
  })

  it.each(['/private', '/public'])(
    'never shows the page to another user, and loads the document once (%s)',
    async path => {
      await renderApp(path)
      const release = hold()
      verdict = USER_B
      restore()
      expect(page()).not.toBeVisible()

      release()
      await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
      expect(page()).not.toBeInTheDocument()
      await wait(RESTORE_CHECK_MS * 2)
      expect(page()).not.toBeInTheDocument()
      expect(location.reload).toHaveBeenCalledTimes(1)
    },
  )

  it('signed out on a private page: the server redirects, and the page stays hidden meanwhile', async () => {
    await renderApp()
    verdict = NO_SESSION
    restore()
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith('/login'))
    expect(page()).not.toBeVisible()
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('signed out on a public page: stays hidden, and the document is loaded once', async () => {
    await renderApp('/public')
    verdict = NO_SESSION
    restore()
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
    await wait(RESTORE_CHECK_MS * 2)
    const left = page()
    if (left) expect(left).not.toBeVisible()
    expect(location.reload).toHaveBeenCalledTimes(1)
    expect(location.assign).not.toHaveBeenCalled()
  })

  it.each([
    ['an outage', UNKNOWN, SERVER_TROUBLE_TITLE],
    [
      'an answered error',
      { kind: 'unknown', reason: 'answered-error' } as AppSessionVerdict,
      SESSION_UNKNOWN_TITLE,
    ],
  ])(
    'unknown (%s): the recovering screen is visible, nobody is signed out',
    async (_l, v, title) => {
      await renderApp()
      verdict = v
      restore()
      expect(await screen.findByText(title)).toBeVisible()
      expect(page()).not.toBeInTheDocument()
      expect(location.reload).not.toHaveBeenCalled()
      expect(location.assign).not.toHaveBeenCalled()
    },
  )

  it('unknown on a public page: shown again', async () => {
    await renderApp('/public')
    verdict = UNKNOWN
    restore()
    expect(page()).not.toBeVisible()
    await waitFor(() => expect(page()).toBeVisible())
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('offline: the offline screen, not a blank page', async () => {
    await renderApp()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    answer = () => Promise.reject(new TypeError('Failed to fetch'))
    restore()
    expect(await screen.findByText(OFFLINE_TITLE)).toBeVisible()
    expect(page()).not.toBeInTheDocument()
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('no answer at all: the recovering screen after the bound, not a blank page', async () => {
    await renderApp()
    hold()
    restore()
    await wait(RESTORE_CHECK_MS - 100)
    expect(page()).not.toBeVisible()
    await wait(200)
    expect(screen.getByText(SERVER_TROUBLE_TITLE)).toBeVisible()
    expect(page()).not.toBeInTheDocument()
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('a second restore during the check starts it again', async () => {
    await renderApp()
    hold()
    restore()
    await wait(RESTORE_CHECK_MS - 100)
    restore()
    await wait(200)
    expect(screen.queryByText(SERVER_TROUBLE_TITLE)).not.toBeInTheDocument()
    expect(page()).not.toBeVisible()
  })

  it('a document that never rendered a signed-in user is judged again, never hidden', async () => {
    verdict = NO_SESSION
    await renderApp('/public')
    hold()
    restore()
    expect(page()).toBeVisible()
    await waitFor(() => expect(checks).toBe(1))
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('an ordinary load (not restored) does nothing', async () => {
    await renderApp()
    restore(false)
    await wait(100)
    expect(page()).toBeVisible()
    expect(checks).toBe(0)
  })
})

// A document load that never commits: the user stopped it, or the network is gone. Nothing of the
// previous user may be seen while it is awaited, and the page may not stay blank for good.
describe('a document load that is awaited', () => {
  function expectNothingVisible() {
    const left = page()
    if (left) expect(left).not.toBeVisible()
    expect(screen.queryByText(SERVER_TROUBLE_TITLE)).not.toBeInTheDocument()
  }

  async function expectRecoveringScreenAfterTheBound() {
    expectNothingVisible()
    await wait(RESTORE_CHECK_MS - 500)
    expectNothingVisible()
    await wait(600)
    expect(screen.getByText(SERVER_TROUBLE_TITLE)).toBeVisible()
    expect(page()).not.toBeInTheDocument()
  }

  it.each(['/private', '/public'])(
    'a restored document that was left for another session is hidden at once (%s)',
    async path => {
      await renderApp(path)
      clearActiveOrganizationForSessionChange()
      expect(page()).toBeVisible()
      // As the browser runs it: the page is hidden before the reload is even asked for.
      let visibleAtReload: boolean | undefined
      location.reload.mockImplementation(() => {
        visibleAtReload = !document.documentElement.hasAttribute('data-session-checking')
      })
      restore()

      expect(page()).not.toBeVisible()
      expect(visibleAtReload).toBe(false)
      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(checks).toBe(0)
      await expectRecoveringScreenAfterTheBound()
      expect(location.reload).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['/private', '/public'])(
    'keeps the organization the next session chose when it loads the document again (%s)',
    async path => {
      await renderApp(path)
      clearActiveOrganizationForSessionChange()
      // Stored by the document this one was left for, after it loaded.
      localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, 'org-of-the-next-user')
      restore()

      expect(page()).not.toBeVisible()
      expect(location.reload).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)).toBe('org-of-the-next-user')
    },
  )

  it("still forgets the stored organization when another user's verdict reloads a document that was not leaving", async () => {
    storeActiveOrganizationId('org-of-user-a')
    await renderApp('/public')
    verdict = USER_B
    restore()
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY)).toBeNull()
  })

  it('and offline it ends in the offline screen', async () => {
    await renderApp()
    clearActiveOrganizationForSessionChange()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    restore()
    await wait(RESTORE_CHECK_MS + 100)
    expect(screen.getByText(OFFLINE_TITLE)).toBeVisible()
    expect(page()).not.toBeInTheDocument()
  })

  it('so is the sign-in form it was left from, though nobody was signed in on it', async () => {
    verdict = NO_SESSION
    await renderApp('/public')
    clearActiveOrganizationForSessionChange()
    restore()
    expect(page()).not.toBeVisible()
    await expectRecoveringScreenAfterTheBound()
  })

  it.each(['/private', '/public'])(
    "another user's verdict on a restored document (%s)",
    async path => {
      await renderApp(path)
      verdict = USER_B
      restore()
      await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
      await expectRecoveringScreenAfterTheBound()
      expect(location.reload).toHaveBeenCalledTimes(1)
    },
  )

  it('a signed-out verdict on a restored public page', async () => {
    await renderApp('/public')
    verdict = NO_SESSION
    restore()
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
    await expectRecoveringScreenAfterTheBound()
  })

  it("another user's verdict on a document that was never restored", async () => {
    await renderApp('/public')
    verdict = USER_B
    await act(judgeAgain)
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
    await expectRecoveringScreenAfterTheBound()
  })

  it.each([
    ['the first user again', USER_A],
    ['an unknown verdict', UNKNOWN],
    ['a signed-out verdict', NO_SESSION],
  ])('%s after the reload was asked for does not end the wait', async (_label, later) => {
    await renderApp('/public')
    verdict = USER_B
    restore()
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
    verdict = later
    await act(judgeAgain)
    await expectRecoveringScreenAfterTheBound()
    expect(location.reload).toHaveBeenCalledTimes(1)
  })

  it('a verdict that comes after the bound does not hide the recovering screen', async () => {
    await renderApp()
    const release = hold()
    restore()
    await wait(RESTORE_CHECK_MS + 100)
    expect(screen.getByText(SERVER_TROUBLE_TITLE)).toBeVisible()
    verdict = USER_B
    release()
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))
    expect(screen.getByText(SERVER_TROUBLE_TITLE)).toBeVisible()
    expect(page()).not.toBeInTheDocument()
  })

  it('a document restored while its reload was still awaited is hidden and loaded again', async () => {
    await renderApp('/public')
    verdict = USER_B
    restore()
    await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1))

    restore()
    expect(location.reload).toHaveBeenCalledTimes(2)
    await expectRecoveringScreenAfterTheBound()

    // Left from the recovering screen, and restored again: it asks once more, and stays up.
    restore()
    expect(location.reload).toHaveBeenCalledTimes(3)
    expect(screen.getByText(SERVER_TROUBLE_TITLE)).toBeVisible()
  })
})
