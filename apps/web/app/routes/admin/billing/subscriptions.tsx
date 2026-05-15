import { gql, type TypedDocumentNode } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { useState } from 'react'

type Subscription = {
  id: string
  createdAt: string
  updatedAt: string
  organizationId: string
  organization?: {
    id: string
    name: string
    emails?: Array<{
      email: string
      primary: boolean
    }>
  }
  planId: string
  plan?: {
    id: string
    name: string
    price: string
    interval: string
  }
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  stripePriceId?: string
  stripeCurrentPeriodEnd?: string
  trialStart?: string
  trialEnd?: string
  cancelAt?: string
  canceledAt?: string
  cancelAtPeriodEnd: boolean
  status: string
}

type AdminSubscriptionsQuery = {
  subscriptions: Subscription[]
  subscriptionsCount: {
    total: number
    count: number
  }
}

const ADMIN_SUBSCRIPTIONS_QUERY: TypedDocumentNode<AdminSubscriptionsQuery> = gql`
  query AdminSubscriptions($input: ListSubscriptionInput) {
    subscriptions(input: $input) {
      id
      createdAt
      updatedAt
      organizationId
      organization {
        id
        name
        emails {
          email
          primary
        }
      }
      planId
      plan {
        id
        name
        price
        interval
      }
      stripeCustomerId
      stripeSubscriptionId
      stripePriceId
      stripeCurrentPeriodEnd
      trialStart
      trialEnd
      cancelAt
      canceledAt
      cancelAtPeriodEnd
      status
    }
    subscriptionsCount(input: $input) {
      total
      count
    }
  }
`

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  TRIALING: 'bg-blue-100 text-blue-800',
  PAST_DUE: 'bg-yellow-100 text-yellow-800',
  CANCELED: 'bg-red-100 text-red-800',
  INCOMPLETE: 'bg-gray-100 text-gray-800',
  INCOMPLETE_EXPIRED: 'bg-gray-100 text-gray-800',
}

export default function AdminBillingSubscriptions() {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState<string>('')

  const { data, loading, error } = useQuery(ADMIN_SUBSCRIPTIONS_QUERY, {
    variables: {
      input: {
        take: 50,
        orderBy: 'createdAt',
        orderDirection: 'desc',
        search,
        searchFields: search ? ['organization.name'] : [],
      },
    },
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading subscriptions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">Error loading subscriptions: {error.message}</div>
      </div>
    )
  }

  let subscriptions = data?.subscriptions || []
  const total = data?.subscriptionsCount?.total || 0

  // Client-side filter by status
  if (statusFilter) {
    subscriptions = subscriptions.filter((sub) => sub.status === statusFilter)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage customer subscriptions ({total} total)
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700">
              Search
            </label>
            <input
              type="text"
              id="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by organization name..."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Filter by Status
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIALING">Trialing</option>
              <option value="PAST_DUE">Past Due</option>
              <option value="CANCELED">Canceled</option>
              <option value="INCOMPLETE">Incomplete</option>
            </select>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Organization
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Plan
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  MRR
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Current Period End
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Trial
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No subscriptions found
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => {
                  const primaryEmail = sub.organization?.emails?.find((e) => e.primary)
                  const periodEnd = sub.stripeCurrentPeriodEnd
                    ? new Date(sub.stripeCurrentPeriodEnd).toLocaleDateString()
                    : 'N/A'
                  const isTrial = sub.trialEnd && new Date(sub.trialEnd) > new Date()

                  return (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {sub.organization?.name}
                        </div>
                        <div className="text-sm text-gray-500">{primaryEmail?.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{sub.plan?.name}</div>
                        <div className="text-sm text-gray-500">{sub.plan?.interval}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[sub.status] || STATUS_COLORS.INCOMPLETE
                          }`}
                        >
                          {sub.status}
                        </span>
                        {sub.cancelAtPeriodEnd && (
                          <div className="text-xs text-red-600 mt-1">Canceling</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${parseFloat(sub.plan?.price || '0').toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {periodEnd}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isTrial ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Trial
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {sub.stripeCustomerId && (
                          <a
                            href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            View in Stripe
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-blue-600 font-medium">Active</div>
            <div className="text-2xl font-bold text-blue-900">
              {subscriptions.filter((s) => s.status === 'ACTIVE').length}
            </div>
          </div>
          <div>
            <div className="text-blue-600 font-medium">Trialing</div>
            <div className="text-2xl font-bold text-blue-900">
              {subscriptions.filter((s) => s.status === 'TRIALING').length}
            </div>
          </div>
          <div>
            <div className="text-blue-600 font-medium">Past Due</div>
            <div className="text-2xl font-bold text-blue-900">
              {subscriptions.filter((s) => s.status === 'PAST_DUE').length}
            </div>
          </div>
          <div>
            <div className="text-blue-600 font-medium">Canceled</div>
            <div className="text-2xl font-bold text-blue-900">
              {subscriptions.filter((s) => s.status === 'CANCELED').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
