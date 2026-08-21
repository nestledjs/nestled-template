import { Link } from 'react-router'
import { useQuery, useMutation } from '@apollo/client/react'
import {
  AdminBillingPlans,
  AdminBillingSubscriptions,
  AdminSyncStripePrices,
  AdminSyncStripeProducts,
} from '@nestled-template/shared/sdk'
import {
  ArrowPathIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'




function getSubscriptionStatusClass(status: string): string {
  if (status === 'ACTIVE') return 'bg-green-100 text-green-800'
  if (status === 'TRIALING') return 'bg-blue-100 text-blue-800'
  return 'bg-red-100 text-red-800'
}








export default function AdminBillingOverview() {
  const [syncing, setSyncing] = useState(false)

  const { data: plansData, refetch: refetchPlans } = useQuery(AdminBillingPlans)
  const { data: subsData } = useQuery(AdminBillingSubscriptions, {
    variables: { input: { take: 5 } },
  })

  const [syncProducts] = useMutation(AdminSyncStripeProducts)
  const [syncPrices] = useMutation(AdminSyncStripePrices)

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

  const plans = plansData?.adminBillingPlans || []
  const subscriptions = subsData?.adminBillingSubscriptions?.subscriptions || []
  const totalSubscriptions = subsData?.adminBillingSubscriptions?.total || 0

  const activeSubscriptions = subscriptions.filter(s => s.status === 'ACTIVE').length
  const activePlans = plans.filter(p => p.active).length

  const monthlyRecurringRevenue = subscriptions.reduce((sum, s) => {
    if (s.status !== 'ACTIVE' || !s.plan?.price) {
      return sum
    }

    // price is the GraphQL Decimal scalar, which serializes as a string.
    const price = Number.parseFloat(String(s.plan.price))
    return Number.isFinite(price) ? sum + price : sum
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
          to="/admin/billing/plans"
          className="relative block bg-white rounded-lg border-2 border-gray-300 border-dashed p-8 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Manage Plans</h3>
          <p className="mt-1 text-sm text-gray-500">View and manage products and prices</p>
        </Link>

        <Link
          to="/admin/billing/subscriptions"
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
              to="/admin/billing/subscriptions"
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
              {subscriptions.map(sub => (
                <div key={sub.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{sub.organization?.name}</p>
                    <p className="text-sm text-gray-500">{sub.plan?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      ${Number.parseFloat(sub.plan?.price || '0').toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSubscriptionStatusClass(sub.status)}`}
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
