import { gql, type TypedDocumentNode } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

function formatLimitValue(value: unknown): string | number {
  if (value === -1 || value === null) return 'Unlimited'
  if (typeof value === 'number') return value
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

type Plan = {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  description?: string
  price: string
  interval: string
  features?: string[]
  limits?: Record<string, unknown>
  active: boolean
  stripeProductId?: string
  stripePriceId?: string
  trialPeriodDays?: number
}

type AdminPlansQuery = {
  plans: Plan[]
}

const ADMIN_PLANS_QUERY: TypedDocumentNode<AdminPlansQuery> = gql`
  query AdminPlans {
    plans {
      id
      createdAt
      updatedAt
      name
      description
      price
      interval
      features
      limits
      active
      stripeProductId
      stripePriceId
      trialPeriodDays
    }
  }
`

export default function AdminBillingPlans() {
  const { data, loading, error } = useQuery(ADMIN_PLANS_QUERY)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading plans...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">Error loading plans: {error.message}</div>
      </div>
    )
  }

  const plans = data?.plans || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plans & Pricing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage product and price configurations from Stripe
        </p>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {plans.length === 0 ? (
          <div className="col-span-full bg-white shadow rounded-lg p-12 text-center">
            <p className="text-gray-500">No plans found. Sync from Stripe to import plans.</p>
          </div>
        ) : (
          plans.map(plan => (
            <div
              key={plan.id}
              className="bg-white shadow rounded-lg divide-y divide-gray-200 border-2 border-gray-200 hover:border-blue-400 transition-colors"
            >
              {/* Plan Header */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  {plan.active ? (
                    <CheckCircleIcon className="h-6 w-6 text-green-500" title="Active" />
                  ) : (
                    <XCircleIcon className="h-6 w-6 text-gray-400" title="Inactive" />
                  )}
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline">
                    <span className="text-4xl font-bold text-gray-900">
                      ${Number.parseFloat(plan.price).toFixed(2)}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">/ {plan.interval}</span>
                  </div>
                </div>

                {plan.description && (
                  <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                )}

                {plan.trialPeriodDays && (
                  <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {plan.trialPeriodDays} day trial
                  </div>
                )}
              </div>

              {/* Features */}
              {plan.features && Array.isArray(plan.features) && plan.features.length > 0 && (
                <div className="p-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Features</h4>
                  <ul className="space-y-2">
                    {plan.features.map((feature: string) => (
                      <li key={feature} className="flex items-start">
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Limits */}
              {plan.limits &&
                typeof plan.limits === 'object' &&
                Object.keys(plan.limits).length > 0 && (
                  <div className="p-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Limits</h4>
                    <dl className="space-y-2">
                      {Object.entries(plan.limits).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <dt className="text-gray-600 capitalize">
                            {key.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}
                          </dt>
                          <dd className="font-medium text-gray-900">{formatLimitValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

              {/* Stripe IDs */}
              <div className="p-6 bg-gray-50">
                <div className="space-y-1 text-xs">
                  {plan.stripeProductId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Product ID:</span>
                      <span className="font-mono text-gray-700">{plan.stripeProductId}</span>
                    </div>
                  )}
                  {plan.stripePriceId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Price ID:</span>
                      <span className="font-mono text-gray-700">{plan.stripePriceId}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Plans are synced from Stripe. To create or modify plans, use the{' '}
          <a
            href="https://dashboard.stripe.com/products"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium hover:text-blue-900"
          >
            Stripe Dashboard
          </a>{' '}
          and then click "Sync from Stripe" to update here.
        </p>
      </div>
    </div>
  )
}
