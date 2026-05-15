import { Link } from 'react-router'
import { gql, type TypedDocumentNode } from '@apollo/client'
import { useQuery, useMutation } from '@apollo/client/react'
import {
  ArrowPathIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'

type Plan = {
  id: string
  name: string
  description?: string
  price: string
  interval: string
  active: boolean
  stripeProductId?: string
  stripePriceId?: string
  trialPeriodDays?: number
}

type Subscription = {
  id: string
  status: string
  organizationId: string
  organization?: {
    id: string
    name: string
  }
  plan?: {
    id: string
    name: string
    price: string
  }
  stripeCurrentPeriodEnd?: string
}

type AdminPlansQuery = {
  plans: Plan[]
}

type AdminSubscriptionsQuery = {
  subscriptions: Subscription[]
  subscriptionsCount: {
    total: number
    count: number
  }
}

type AdminSyncStripeProductsMutation = {
  syncStripeProducts: boolean
}

type AdminSyncStripePricesMutation = {
  syncStripePrices: boolean
}

const ADMIN_PLANS_QUERY: TypedDocumentNode<AdminPlansQuery> = gql`
  query AdminPlans {
    plans {
      id
      name
      description
      price
      interval
      active
      stripeProductId
      stripePriceId
      trialPeriodDays
    }
  }
`

const ADMIN_SUBSCRIPTIONS_QUERY: TypedDocumentNode<AdminSubscriptionsQuery> = gql`
  query AdminSubscriptions($input: ListSubscriptionInput) {
    subscriptions(input: $input) {
      id
      status
      organizationId
      organization {
        id
        name
      }
      plan {
        id
        name
        price
      }
      stripeCurrentPeriodEnd
    }
    subscriptionsCount(input: $input) {
      total
      count
    }
  }
`

const SYNC_PRODUCTS_MUTATION: TypedDocumentNode<AdminSyncStripeProductsMutation> = gql`
  mutation AdminSyncStripeProducts {
    syncStripeProducts
  }
`

const SYNC_PRICES_MUTATION: TypedDocumentNode<AdminSyncStripePricesMutation> = gql`
  mutation AdminSyncStripePrices {
    syncStripePrices
  }
`

export default function AdminBillingOverview() {
  const [syncing, setSyncing] = useState(false)

  const { data: plansData, refetch: refetchPlans } = useQuery(ADMIN_PLANS_QUERY)
  const { data: subsData } = useQuery(ADMIN_SUBSCRIPTIONS_QUERY, {
    variables: { input: { take: 5, orderBy: 'createdAt', orderDirection: 'desc' } },
  })

  const [syncProducts] = useMutation(SYNC_PRODUCTS_MUTATION)
  const [syncPrices] = useMutation(SYNC_PRICES_MUTATION)

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncProducts()
      await syncPrices()
      await refetchPlans()
      alert('Stripe data synced successfully!')
    } catch (error) {
      console.error('Sync error:', error)
      alert('Failed to sync Stripe data. Check console for details.')
    } finally {
      setSyncing(false)
    }
  }

  const plans = plansData?.plans || []
  const subscriptions = subsData?.subscriptions || []
  const totalSubscriptions = subsData?.subscriptionsCount?.total || 0

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'ACTIVE').length
  const activePlans = plans.filter((p) => p.active).length

  const monthlyRecurringRevenue = subscriptions
    .filter((s) => s.status === 'ACTIVE' && s.plan?.price)
    .reduce((sum: number, s: any) => {
      const price = parseFloat(s.plan.price)
      return sum + price
    }, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage Stripe products, prices, and subscriptions
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className={`-ml-1 mr-2 h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync from Stripe'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Active Subscriptions
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">{activeSubscriptions}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CurrencyDollarIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">MRR</dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    ${monthlyRecurringRevenue.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CreditCardIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Subscriptions
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">{totalSubscriptions}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CreditCardIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Plans</dt>
                  <dd className="text-lg font-semibold text-gray-900">{activePlans}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Link
          to="/settings/admin/billing/plans"
          className="relative block bg-white rounded-lg border-2 border-gray-300 border-dashed p-8 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Manage Plans</h3>
          <p className="mt-1 text-sm text-gray-500">View and manage products and prices</p>
        </Link>

        <Link
          to="/settings/admin/billing/subscriptions"
          className="relative block bg-white rounded-lg border-2 border-gray-300 border-dashed p-8 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">View Subscriptions</h3>
          <p className="mt-1 text-sm text-gray-500">See all customer subscriptions</p>
        </Link>
      </div>

      {/* Recent Subscriptions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">Recent Subscriptions</h2>
            <Link
              to="/settings/admin/billing/subscriptions"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              View all
            </Link>
          </div>
        </div>
        <div className="px-4 py-5 sm:p-6">
          {subscriptions.length === 0 ? (
            <p className="text-sm text-gray-500">No subscriptions yet</p>
          ) : (
            <div className="space-y-4">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{sub.organization?.name}</p>
                    <p className="text-sm text-gray-500">{sub.plan?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      ${parseFloat(sub.plan?.price || '0').toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          sub.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : sub.status === 'TRIALING'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {sub.status}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
