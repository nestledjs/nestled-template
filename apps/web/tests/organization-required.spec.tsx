import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloProvider } from '@apollo/client/react'
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client'
import { makeClient, storeActiveOrganizationId } from '@nestled-template/shared/apollo'
import {
  NO_ORGANIZATIONS_TITLE,
  ORGANIZATION_PICKER_TITLE,
  ORGANIZATIONS_UNAVAILABLE_MESSAGE,
  OrganizationRequired,
  SWITCH_FAILED_MESSAGE,
} from '../app/organization-required'

type Organization = { id: string; name: string }

const organization = ({ id, name }: Organization) => ({
  __typename: 'Organization',
  id,
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  logo: null,
})

function renderPicker({
  organizations = [] as Organization[],
  listFails = false,
  switchFails = false,
  holdSwitch = false,
} = {}) {
  const switched: string[] = []
  // With `holdSwitch`, the switch answers only when the test calls `answerSwitch`.
  const held = { answerSwitch: () => undefined as void }
  const link = new ApolloLink(
    operation =>
      new Observable<ApolloLink.Result>(observer => {
        if (operation.operationName === 'myOrganizations') {
          if (listFails) {
            observer.next({ errors: [{ message: 'Internal server error' }] } as never)
          } else {
            observer.next({ data: { myOrganizations: organizations.map(organization) } })
          }
        } else if (operation.operationName === 'switchActiveOrganization') {
          switched.push(operation.variables['input'].organizationId)
          if (holdSwitch) {
            held.answerSwitch = () => {
              observer.next({
                data: {
                  switchActiveOrganization: {
                    __typename: 'User',
                    id: 'user-1',
                    activeOrganizationId: operation.variables['input'].organizationId,
                  },
                },
              })
              observer.complete()
            }
            return
          }
          if (switchFails) {
            observer.next({
              errors: [{ message: 'You are not a member of this organization' }],
            } as never)
          } else {
            observer.next({
              data: {
                switchActiveOrganization: {
                  __typename: 'User',
                  id: 'user-1',
                  activeOrganizationId: operation.variables['input'].organizationId,
                },
              },
            })
          }
        }
        observer.complete()
      }),
  )
  // The app's client defaults (`makeClient`: `errorPolicy: 'all'` for queries and mutations), so a
  // GraphQL refusal behaves here as it does in the app: it resolves, it does not throw.
  const client = new ApolloClient({
    link,
    cache: new InMemoryCache(),
    defaultOptions: makeClient(undefined, { apiUrl: 'http://localhost:3000/graphql' })
      .defaultOptions,
  })
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <OrganizationRequired />
      </MemoryRouter>
    </ApolloProvider>,
  )
  return { switched, held }
}

describe('OrganizationRequired', () => {
  const reload = vi.fn()
  const assign = vi.fn()

  beforeEach(() => {
    reload.mockReset()
    assign.mockReset()
    vi.stubGlobal('location', { ...globalThis.location, reload, assign })
    localStorage.removeItem('activeOrganizationId')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.removeItem('activeOrganizationId')
  })

  it("lists the user's organizations", async () => {
    renderPicker({
      organizations: [
        { id: 'org-1', name: 'First Org' },
        { id: 'org-2', name: 'Second Org' },
      ],
    })

    expect(await screen.findByRole('heading', { name: ORGANIZATION_PICKER_TITLE })).toBeVisible()
    expect(screen.getByRole('button', { name: 'First Org' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Second Org' })).toBeVisible()
    expect(screen.getByText(/You are still signed in/)).toBeVisible()
  })

  it('switches to the chosen organization, then reloads', async () => {
    const { switched } = renderPicker({
      organizations: [
        { id: 'org-1', name: 'First Org' },
        { id: 'org-2', name: 'Second Org' },
      ],
    })

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Second Org' }))
    })

    expect(switched).toEqual(['org-2'])
    expect(localStorage.getItem('activeOrganizationId')).toBe('org-2')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(assign).not.toHaveBeenCalled()
  })

  it('says plainly that there are none, and offers a normal sign-out', async () => {
    renderPicker({ organizations: [] })

    expect(await screen.findByRole('heading', { name: NO_ORGANIZATIONS_TITLE })).toBeVisible()
    expect(screen.getByText(/does not belong to one/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sign out' })).toHaveAttribute('href', '/logout')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('shows a message, stores nothing and does not reload when the API refuses the switch', async () => {
    const { switched } = renderPicker({
      organizations: [{ id: 'org-1', name: 'First Org' }],
      switchFails: true,
    })

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'First Org' }))
    })

    expect(switched).toEqual(['org-1'])
    expect(await screen.findByRole('alert')).toHaveTextContent(SWITCH_FAILED_MESSAGE)
    // Still on the picker, able to try again: no reload, no logout, nothing stored.
    expect(screen.getByRole('button', { name: 'First Org' })).toBeEnabled()
    expect(reload).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(localStorage.getItem('activeOrganizationId')).toBeNull()
  })

  it('stores nothing and does not reload when the switch is answered after a logout', async () => {
    const { switched, held } = renderPicker({
      organizations: [{ id: 'org-1', name: 'First Org' }],
      holdSwitch: true,
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'First Org' }))
    })
    expect(switched).toEqual(['org-1'])

    // The session ends (every logout forgets the stored organization) before the API answers.
    storeActiveOrganizationId(null)
    await act(async () => {
      held.answerSwitch()
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(localStorage.getItem('activeOrganizationId')).toBeNull()
    expect(reload).not.toHaveBeenCalled()
    // A dropped answer is not a failed switch.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the session when the organizations cannot be loaded', async () => {
    renderPicker({ listFails: true })

    expect(await screen.findByRole('alert')).toHaveTextContent(ORGANIZATIONS_UNAVAILABLE_MESSAGE)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
    expect(assign).not.toHaveBeenCalled()
  })
})
