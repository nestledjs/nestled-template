import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpgradeModal } from './upgrade-modal'

const useQuery = vi.fn()
const useMutation = vi.fn()
const useSubscription = vi.fn()
const createCheckout = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: (...args: unknown[]) => useMutation(...args),
}))

vi.mock('@nestled-template/shared/sdk', () => ({
  ActivePlans: { kind: 'Document', definitions: [] },
  CreateCheckoutSession: { kind: 'Document', definitions: [] },
}))

vi.mock('../hooks/use-subscription', () => ({
  useSubscription: () => useSubscription(),
}))

describe('UpgradeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSubscription.mockReturnValue({ plan: { id: 'basic', name: 'Basic' } })
    useMutation.mockReturnValue([createCheckout, { loading: false }])
    useQuery.mockReturnValue({
      loading: false,
      data: {
        plans: [
          {
            id: 'basic',
            name: 'Basic',
            description: 'Starter plan',
            price: '0',
            interval: 'month',
            stripePriceId: 'price-basic',
            features: { projects: true, support: true },
            trialPeriodDays: 0,
          },
          {
            id: 'pro',
            name: 'Pro',
            description: 'Pro plan',
            price: '19.5',
            interval: 'month',
            stripePriceId: 'price-pro',
            features: ['More projects', 'Priority support'],
            trialPeriodDays: 14,
          },
        ],
      },
    })
  })

  it('renders current and upgrade plans with feature context', () => {
    render(
      <UpgradeModal
        isOpen
        onClose={vi.fn()}
        feature="Advanced Reports"
        reason="Access reporting tools"
      />,
    )

    expect(screen.getByText('Upgrade Your Plan')).toBeTruthy()
    expect(screen.getByText('Unlock: Advanced Reports')).toBeTruthy()
    expect(screen.getByText('Access reporting tools')).toBeTruthy()
    expect(screen.getByText('Current plan:')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Current Plan' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText('14 day free trial')).toBeTruthy()
    expect(screen.getByText('More projects')).toBeTruthy()
    expect(screen.getByText('projects')).toBeTruthy()
  })

  it('shows loading and empty states', () => {
    useQuery.mockReturnValueOnce({ loading: true, data: undefined })
    const { rerender } = render(<UpgradeModal isOpen onClose={vi.fn()} />)

    expect(screen.getByText('Loading plans...')).toBeTruthy()

    useQuery.mockReturnValueOnce({ loading: false, data: { plans: [] } })
    rerender(<UpgradeModal isOpen onClose={vi.fn()} />)

    expect(screen.getByText('No plans available at this time.')).toBeTruthy()
  })

  it('starts checkout and redirects to Stripe', async () => {
    createCheckout.mockResolvedValue({
      data: { createCheckoutSession: 'https://checkout.stripe.test/session' },
    })

    render(<UpgradeModal isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Plan' }))

    await waitFor(() => {
      expect(createCheckout).toHaveBeenCalledWith({
        variables: { priceId: 'price-pro' },
      })
    })
  })

  it('alerts when checkout creation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const alert = vi.spyOn(globalThis, 'alert').mockImplementation(() => undefined)
    createCheckout.mockRejectedValue(new Error('Stripe unavailable'))

    render(<UpgradeModal isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Plan' }))

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Failed to start checkout. Please try again.')
    })
    expect(consoleError).toHaveBeenCalled()
  })
})
