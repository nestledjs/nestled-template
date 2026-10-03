import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireLimit, RequireLimitInline, RequirePlan, RequirePlanInline } from './require-plan'

let subscriptionState: any
let hasFeatures = true
let hasAnyFeature = true
let limitState: any

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../hooks/use-subscription', () => ({
  useSubscription: () => subscriptionState,
  useHasFeatures: () => hasFeatures,
  useHasAnyFeature: () => hasAnyFeature,
}))

vi.mock('../hooks/use-plan', () => ({
  useLimit: () => limitState,
}))

describe('plan requirement components', () => {
  beforeEach(() => {
    subscriptionState = { isLoading: false, plan: { name: 'Starter' } }
    hasFeatures = true
    hasAnyFeature = true
    limitState = { isWithin: true, hasLimit: true, limit: 10 }
  })

  it('renders children when plan and limits allow access', () => {
    render(
      <>
        <RequirePlan feature="reports">
          <span>Reports</span>
        </RequirePlan>
        <RequireLimit limitKey="max_projects" currentValue={1}>
          <span>Create Project</span>
        </RequireLimit>
      </>,
    )

    expect(screen.getByText('Reports')).toBeTruthy()
    expect(screen.getByText('Create Project')).toBeTruthy()
  })

  it('renders upgrade and limit fallbacks when access is blocked', () => {
    hasFeatures = false
    limitState = { isWithin: false, hasLimit: true, limit: 3 }

    render(
      <>
        <RequirePlan feature="reports" />
        <RequireLimit limitKey="max_projects" currentValue={3} />
      </>,
    )

    expect(screen.getByText('Upgrade Required')).toBeTruthy()
    expect(screen.getByText('Limit Reached')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Upgrade Plan' })).toHaveLength(2)
  })

  it('hides inline variants while loading or blocked', () => {
    subscriptionState = { isLoading: true, plan: null }
    const { container } = render(
      <>
        <RequirePlanInline feature="reports">Inline Plan</RequirePlanInline>
        <RequireLimitInline limitKey="max_projects" currentValue={3}>
          Inline Limit
        </RequireLimitInline>
      </>,
    )

    expect(container.innerHTML).toBe('')
  })
})
