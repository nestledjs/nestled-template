import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApolloProvider } from '@apollo/client/react'
import {
  createRoutesStub,
  data,
  Outlet,
  redirectDocument,
  useNavigate,
  useRouteError,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetActiveOrganizationSessionChange,
  clearActiveOrganizationForSessionChange,
  makeClient,
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

function Boundary() {
  return (
    <Layout>
      <ErrorBoundary error={useRouteError()} />
    </Layout>
  )
}

function Page({ name }: Readonly<{ name: string }>) {
  const navigate = useNavigate()
  return (
    <>
      <h1>{name}</h1>
      <input aria-label="draft" />
      <button onClick={() => navigate('/public')}>Public</button>
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

  it('a document that was left for another session is simply loaded again', async () => {
    await renderApp()
    clearActiveOrganizationForSessionChange()
    restore()
    expect(location.reload).toHaveBeenCalledTimes(1)
    expect(checks).toBe(0)
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
