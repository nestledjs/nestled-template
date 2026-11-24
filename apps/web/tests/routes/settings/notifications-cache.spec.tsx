import React from 'react'
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserPreferences } from '@nestled-template/shared/sdk'
import { createTestRouter } from '../../helpers/createTestRouter'
import NotificationsSettings from '../../../app/routes/settings/notifications'

interface Variables {
  userPreferenceId?: string
  input?: { key?: string; value?: string }
}

interface Preference {
  __typename: 'UserPreference'
  id: string
  key: string
  value: string
  createdAt: string
  updatedAt: string
}

function preference(id: string, key: string, value: string): Preference {
  const at = '2026-01-01T00:00:00.000Z'
  return { __typename: 'UserPreference', id, key, value, createdAt: at, updatedAt: at }
}

/**
 * The page on a real client and cache, with an API that keeps the rows and answers a mutation only
 * when the test lets it, so the optimistic state can be looked at.
 */
function renderPage(rows: Preference[], { cached }: { cached?: Preference[] } = {}) {
  const sent: { name: string; variables: Variables }[] = []
  const held: (() => void)[] = []
  // The list's answer, held back when the page starts from a cached one.
  let refresh: (() => void) | undefined

  function answer(name: string, variables: Variables) {
    if (name === 'UserPreferences') return { userPreferences: rows.map(row => ({ ...row })) }
    if (name === 'UserCreateUserPreference') {
      const row = preference(
        `row-${rows.length + 1}`,
        variables.input?.key ?? '',
        variables.input?.value ?? '',
      )
      rows.push(row)
      return { userCreateUserPreference: { ...row } }
    }
    const row = rows.find(({ id }) => id === variables.userPreferenceId)
    if (!row) throw new Error('Preference not found')
    row.value = variables.input?.value ?? ''
    return { userUpdateUserPreference: { ...row } }
  }

  const link = new ApolloLink(operation => {
    const { operationName: name = '', variables } = operation
    sent.push({ name, variables })
    return new Observable(observer => {
      const send = () => {
        try {
          observer.next({ data: answer(name, variables) })
          observer.complete()
        } catch (error) {
          observer.error(error)
        }
      }
      if (name !== 'UserPreferences') held.push(send)
      else if (cached) refresh = send
      else queueMicrotask(send)
    })
  })
  const client = new ApolloClient({
    link,
    cache: new InMemoryCache(),
    // As the app's own client.
    defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network' } },
  })
  if (cached) client.writeQuery({ query: UserPreferences, data: { userPreferences: cached } })
  const Router = createTestRouter([
    { path: '/settings/notifications', Component: NotificationsSettings },
  ])
  render(
    <ApolloProvider client={client}>
      <Router initialEntries={['/settings/notifications']} />
    </ApolloProvider>,
  )
  return {
    rows,
    mutations: () => sent.filter(({ name }) => name !== 'UserPreferences'),
    queries: () => sent.filter(({ name }) => name === 'UserPreferences'),
    refresh: () => refresh?.(),
    release: () => held.splice(0).forEach(send => send()),
    loaded: () =>
      waitFor(() =>
        expect(client.readQuery({ query: UserPreferences })?.userPreferences).toBeDefined(),
      ),
  }
}

const toggle = (title: string) => screen.getByRole('switch', { name: `Toggle ${title}` })

async function expectSwitch(title: string, checked: boolean) {
  await waitFor(() => expect(toggle(title)).toHaveAttribute('aria-checked', String(checked)))
}

describe('NotificationsSettings on a real Apollo cache', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['a default that is on', 'Organization Invitations', 'notif_org_invites', true],
    ['a default that is off', 'Product Updates', 'notif_product_updates', false],
  ])('moves a switch that has no saved preference yet: %s', async (_case, title, key, initial) => {
    const page = renderPage([])
    await page.loaded()
    await expectSwitch(title, initial)

    fireEvent.click(toggle(title))
    // Before the API answers, and after.
    await expectSwitch(title, !initial)
    page.release()
    expect(await screen.findByText('Notification preferences saved!')).toBeInTheDocument()
    await expectSwitch(title, !initial)

    expect(page.rows.map(({ key, value }) => ({ key, value }))).toEqual([
      { key, value: String(!initial) },
    ])
    expect(page.queries()).toHaveLength(1)
  })

  it('updates the preference it created when the switch is moved back', async () => {
    const page = renderPage([preference('row-1', 'notif_weekly_digest', 'true')])
    await page.loaded()
    fireEvent.click(toggle('Product Updates'))
    page.release()
    expect(await screen.findByText('Notification preferences saved!')).toBeInTheDocument()
    await expectSwitch('Product Updates', true)

    fireEvent.click(toggle('Product Updates'))
    await expectSwitch('Product Updates', false)
    page.release()
    await waitFor(() => expect(page.rows[1].value).toBe('false'))

    expect(page.mutations().map(({ name }) => name)).toEqual([
      'UserCreateUserPreference',
      'UserUpdateUserPreference',
    ])
    expect(page.mutations()[1].variables).toMatchObject({ userPreferenceId: 'row-2' })
    await expectSwitch('Product Updates', false)
  })

  it('moves a switch that has a saved preference', async () => {
    const page = renderPage([preference('row-1', 'notif_weekly_digest', 'true')])
    await page.loaded()
    fireEvent.click(toggle('Weekly Digest'))
    await expectSwitch('Weekly Digest', false)
    page.release()
    await waitFor(() => expect(page.rows[0].value).toBe('false'))
    await expectSwitch('Weekly Digest', false)
  })

  it('sends one save at a time for a switch, and never the id of an unsaved preference', async () => {
    const page = renderPage([])
    await page.loaded()
    fireEvent.click(toggle('Product Updates'))
    await expectSwitch('Product Updates', true)
    fireEvent.click(toggle('Product Updates'))
    // Another switch is not held up.
    fireEvent.click(toggle('Newsletters'))
    await expectSwitch('Newsletters', true)
    page.release()
    await waitFor(() => expect(page.rows).toHaveLength(2))
    expect(page.mutations().map(({ name }) => name)).toEqual([
      'UserCreateUserPreference',
      'UserCreateUserPreference',
    ])
    await expectSwitch('Product Updates', true)
    expect(screen.queryByText('Preference not found')).not.toBeInTheDocument()
  })

  it('puts the switch back when the save fails', async () => {
    const page = renderPage([preference('row-1', 'notif_weekly_digest', 'true')])
    await page.loaded()
    page.rows.length = 0
    fireEvent.click(toggle('Weekly Digest'))
    await expectSwitch('Weekly Digest', false)
    page.release()
    expect(await screen.findByText('Preference not found')).toBeInTheDocument()
    await expectSwitch('Weekly Digest', true)
  })

  it('keeps two switches created in the same millisecond apart', async () => {
    const page = renderPage([])
    await page.loaded()
    vi.spyOn(Date, 'now').mockReturnValue(1_767_225_600_000)
    fireEvent.click(toggle('Product Updates'))
    fireEvent.click(toggle('Newsletters'))
    await expectSwitch('Newsletters', true)
    await expectSwitch('Product Updates', true)
  })

  it('saves nothing until the preferences have loaded, and says so', async () => {
    const page = renderPage([preference('row-1', 'notif_product_updates', 'true')])
    fireEvent.click(toggle('Product Updates'))
    expect(await screen.findByText(/still loading/i)).toBeInTheDocument()
    expect(page.mutations()).toEqual([])

    await page.loaded()
    await expectSwitch('Product Updates', true)
    fireEvent.click(toggle('Product Updates'))
    await expectSwitch('Product Updates', false)
    expect(page.mutations().map(({ name }) => name)).toEqual(['UserUpdateUserPreference'])
  })

  it('saves nothing while a cached list is being refreshed', async () => {
    const page = renderPage([], { cached: [] })
    await expectSwitch('Product Updates', false)
    fireEvent.click(toggle('Product Updates'))
    // Its answer could be older than the save, and would take the new preference out again.
    expect(await screen.findByText(/still loading/i)).toBeInTheDocument()
    expect(page.mutations()).toEqual([])

    await act(async () => page.refresh())
    fireEvent.click(toggle('Product Updates'))
    await expectSwitch('Product Updates', true)
    expect(page.mutations()).toHaveLength(1)
  })
})
