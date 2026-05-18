import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MultiUsageLimitWarning, UsageBadge, UsageLimitWarning } from './usage-limit-warning'

let limitState: any
let limitsState: Record<string, any>

vi.mock('../hooks/use-plan', () => ({
  useLimit: () => limitState,
  useLimits: () => limitsState,
}))

vi.mock('./upgrade-modal', () => ({
  UpgradeModal: ({ isOpen, reason, onClose }: any) =>
    isOpen ? (
      <div role="dialog">
        <p>{reason}</p>
        <button onClick={onClose}>Close upgrade</button>
      </div>
    ) : null,
}))

describe('UsageLimitWarning', () => {
  beforeEach(() => {
    limitState = {
      limit: 10,
      hasLimit: true,
      isAtLimit: false,
      remaining: 2,
      percentUsed: 80,
    }
    limitsState = {}
  })

  it('renders warnings and opens the upgrade modal', () => {
    render(<UsageLimitWarning limitKey="max_projects" currentValue={8} />)

    expect(screen.getByText('Max Projects')).toBeTruthy()
    expect(screen.getByText(/8 of 10 used/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }))
    expect(screen.getByRole('dialog').textContent).toContain('8 of 10 max projects')
  })

  it('returns null for unlimited plans and renders at-limit badges', () => {
    limitState = { limit: -1, hasLimit: true, isAtLimit: false, remaining: 0, percentUsed: 0 }
    const { container } = render(<UsageLimitWarning limitKey="max_projects" currentValue={99} />)
    expect(container.innerHTML).toBe('')

    limitState = { limit: 10, hasLimit: true, isAtLimit: true, remaining: 0, percentUsed: 100 }
    render(<UsageBadge limitKey="max_projects" currentValue={10} />)
    expect(screen.getByText('10/10')).toBeTruthy()
  })

  it('renders only tracked limits in the multi-limit warning', () => {
    limitsState = {
      max_projects: { limit: 10, hasLimit: true },
      max_storage: { limit: -1, hasLimit: true },
    }

    render(<MultiUsageLimitWarning limits={{ max_projects: 8, max_storage: 99 }} />)

    expect(screen.getByText('Max Projects')).toBeTruthy()
    expect(screen.queryByText('Max Storage')).toBeNull()
  })
})
