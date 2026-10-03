import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebUiDataTable } from './web-ui-data-table'

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('WebUiDataTable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders rows, sorting, id controls, filters, and pagination', async () => {
    const setSort = vi.fn()
    const setSkip = vi.fn()

    render(
      <WebUiDataTable
        path="/admin/users"
        fields={['id', 'name', 'profile.title']}
        data={[{ id: 'user-1', name: 'Ada', profile: { title: 'Engineer' } }]}
        additionalFilters={<div>Extra filters</div>}
        sort={{ orderBy: 'name', orderDirection: 'asc' }}
        setSort={setSort}
        setSkip={setSkip}
        pagination={{ skip: 20, take: 20, count: 50 }}
      />,
    )

    expect(screen.getByText('Extra filters')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit user-1' }).getAttribute('href')).toBe(
      '/admin/users/user-1',
    )
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Engineer')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(setSort).toHaveBeenCalledWith({ orderBy: 'name', orderDirection: 'desc' })

    fireEvent.click(screen.getByRole('button', { name: 'Show ID' }))
    expect(screen.getByText('user-1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copy ID' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('user-1')
    // copyToClipboard awaits navigator.clipboard.writeText and then sets state, so the
    // update lands on a later microtask. Flush it inside act() to avoid a "not wrapped in
    // act(...)" warning — the click itself already self-flushes, so it stays outside act().
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(setSkip).toHaveBeenCalledWith(0)
    expect(setSkip).toHaveBeenCalledWith(40)
  })

  it('threads field metadata into temporal cells', () => {
    render(
      <WebUiDataTable
        path="/admin/people"
        fields={['id', 'birthDate', 'mandateNotes']}
        data={[
          { id: 'p-1', birthDate: '2026-05-16T00:00:00.000Z', mandateNotes: 'pending review' },
        ]}
        fieldMeta={{
          birthDate: { type: 'DateTime', documentation: '@dateOnly' },
          mandateNotes: { type: 'String' },
        }}
      />,
    )

    // A calendar day stays on its UTC day rather than sliding west of UTC, and a text column
    // whose NAME contains "date" is no longer rendered as the literal string "Invalid Date".
    expect(screen.getByText('May 16, 2026')).toBeTruthy()
    expect(screen.getByText('pending review')).toBeTruthy()
    expect(screen.queryByText('Invalid Date')).toBeNull()
  })
})
