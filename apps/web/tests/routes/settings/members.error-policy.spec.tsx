import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { makeClient } from '@nestled-template/shared/apollo'
import { OrganizationInvitations, OrganizationRoles } from '@nestled-template/shared/sdk'
import { createTestRouter } from '../../helpers/createTestRouter'
import MembersSettings from '../../../app/routes/settings/members'

// Only the reads are stubbed: the invitation runs through a real `useMutation` on a client with
// the app's defaults, so a GraphQL refusal behaves here as it does in the app.
const mockUseReadQuery = vi.fn()
const mockUseQuery = vi.fn()
vi.mock('@apollo/client/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@apollo/client/react')>()
  return {
    ...actual,
    useReadQuery: (...args: unknown[]) => mockUseReadQuery(...args),
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  }
})

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useLoaderData: () => ({ myOrganizationsQueryRef: 'orgs', meQueryRef: 'me' }),
  }
})

vi.mock('@nestled-template/web', () => ({
  RequirePermission: ({ children, fallback }: any) =>
    children === null || children === undefined ? fallback : <>{children}</>,
}))

vi.mock('@nestledjs/forms', () => ({
  Form: ({ submit }: any) => (
    <button
      type="button"
      onClick={() => submit({ email: 'new@example.com', roleId: 'role-member' })}
    >
      Submit Invite Form
    </button>
  ),
}))

const organization = {
  id: 'org-1',
  name: 'Acme',
  members: [{ id: 'member-current', userId: 'user-current', role: { name: 'Owner' } }],
}
const roles = [
  { id: 'role-owner', name: 'Owner', description: null, permissions: [] },
  { id: 'role-member', name: 'Member', description: null, permissions: [] },
]

function renderMembers(result: ApolloLink.Result) {
  const link = new ApolloLink(
    () =>
      new Observable<ApolloLink.Result>(observer => {
        observer.next(result)
        observer.complete()
      }),
  )
  // `makeClient` sets `errorPolicy: 'all'` for mutations; the page must still treat a refusal as a
  // failure.
  const client = new ApolloClient({
    link,
    cache: new InMemoryCache(),
    defaultOptions: makeClient(undefined, { apiUrl: 'http://localhost:3000/graphql' })
      .defaultOptions,
  })
  const Router = createTestRouter([{ path: '/settings/members', Component: MembersSettings }])
  render(
    <ApolloProvider client={client}>
      <Router initialEntries={['/settings/members']} />
    </ApolloProvider>,
  )
}

describe('MembersSettings under the app client error policy', () => {
  const refetch = vi.fn()

  beforeEach(() => {
    refetch.mockReset()
    mockUseReadQuery.mockImplementation((queryRef: unknown) =>
      queryRef === 'orgs'
        ? { data: { myOrganizations: [organization] } }
        : { data: { me: { id: 'user-current' } } },
    )
    mockUseQuery.mockImplementation((query: unknown) => {
      if (query === OrganizationRoles) return { data: { organizationRoles: roles } }
      if (query === OrganizationInvitations) {
        return { data: { organizationInvitations: [] }, loading: false, refetch }
      }
      return { data: { userOrganizationMembers: [] }, loading: false, error: null, refetch }
    })
  })

  it('shows the API refusal, not the success message, when an invitation is refused', async () => {
    renderMembers({
      data: null,
      errors: [{ message: 'Nope', extensions: { code: 'BAD_USER_INPUT' } }],
    } as never)

    fireEvent.click(screen.getByRole('button', { name: /Invite Member/i }))
    fireEvent.click(screen.getByRole('button', { name: /Submit Invite Form/i }))

    expect(await screen.findByText('Nope')).toBeInTheDocument()
    expect(screen.queryByText('Invitation sent successfully!')).not.toBeInTheDocument()
    expect(refetch).not.toHaveBeenCalled()
  })

  it('shows the success message when the invitation is accepted', async () => {
    renderMembers({ data: { createOrganizationInvitation: true } })

    fireEvent.click(screen.getByRole('button', { name: /Invite Member/i }))
    fireEvent.click(screen.getByRole('button', { name: /Submit Invite Form/i }))

    expect(await screen.findByText('Invitation sent successfully!')).toBeInTheDocument()
    expect(screen.queryByText('Nope')).not.toBeInTheDocument()
  })
})
