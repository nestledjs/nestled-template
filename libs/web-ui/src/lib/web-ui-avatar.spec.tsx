import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WebUiAvatar } from './web-ui-avatar'

describe('WebUiAvatar', () => {
  it('names the placeholder icon after the user when there is no image', () => {
    render(<WebUiAvatar placeholder="icon" name="Ada Lovelace" />)
    const icon = screen.getByRole('img', { name: 'Ada Lovelace' })
    expect(icon.tagName.toLowerCase()).toBe('svg')
    expect(icon.getAttribute('aria-hidden')).toBeNull()
  })

  it('names the placeholder icon "Avatar" when there is no name either', () => {
    render(<WebUiAvatar placeholder="icon" />)
    expect(screen.getByRole('img', { name: 'Avatar' }).tagName.toLowerCase()).toBe('svg')
  })

  it('hides the placeholder icon when an image names the avatar', () => {
    const { container } = render(
      <WebUiAvatar placeholder="icon" name="Ada Lovelace" src="https://example.com/a.png" />,
    )
    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.getAttribute('role')).toBeNull()
    expect(icon?.getAttribute('aria-label')).toBeNull()
    // The image is the one named element.
    const named = screen.getAllByRole('img', { name: 'Ada Lovelace' })
    expect(named).toHaveLength(1)
    expect(named[0].tagName.toLowerCase()).toBe('img')
  })

  it('shows initials, and no icon, for the initials placeholder', () => {
    const { container } = render(<WebUiAvatar placeholder="initials" name="Ada Lovelace" />)
    expect(screen.getByText('AL')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('applies the shape, size and notification classes', () => {
    const { container } = render(
      <WebUiAvatar shape="square" size="lg" notification notificationPosition="top" />,
    )
    const root = container.firstElementChild
    expect(root?.className).toContain('h-12 w-12')
    expect(container.querySelector('.top-0.right-0')).not.toBeNull()
  })
})
