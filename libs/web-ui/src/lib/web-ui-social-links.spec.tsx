import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WebUiSocialLinks } from './web-ui-social-links'

const member = {
  facebook: 'https://facebook.com/example',
  twitter: 'https://twitter.com/example',
  instagram: 'https://instagram.com/example',
  linkedin: 'https://linkedin.com/in/example',
  youtube: 'https://youtube.com/user/example',
}

describe('WebUiSocialLinks', () => {
  it('names each link by its network and hides the icon inside it', () => {
    const { container } = render(<WebUiSocialLinks member={member} />)
    for (const name of ['Facebook', 'Twitter', 'Instagram', 'LinkedIn', 'YouTube']) {
      const link = screen.getByRole('link', { name })
      const icon = link.querySelector('svg')
      expect(icon?.getAttribute('aria-hidden')).toBe('true')
      expect(icon?.getAttribute('focusable')).toBe('false')
      expect(icon?.getAttribute('role')).toBeNull()
    }
    // No icon is announced on its own: the link's label is the only name.
    expect(screen.queryAllByRole('img')).toEqual([])
    expect(container.querySelectorAll('svg')).toHaveLength(5)
  })

  it('renders only the networks the member has, with the given fill', () => {
    render(<WebUiSocialLinks member={{ twitter: 'https://twitter.com/example' }} color="black" />)
    const link = screen.getByRole('link', { name: 'Twitter' })
    expect(link.getAttribute('href')).toContain('example')
    expect(link.querySelector('svg')?.getAttribute('fill')).toBe('black')
    expect(screen.queryByRole('link', { name: 'Facebook' })).toBeNull()
  })

  it('links a LinkedIn company page', () => {
    render(<WebUiSocialLinks member={{ linkedin: 'https://linkedin.com/company/example' }} />)
    expect(screen.getByRole('link', { name: 'LinkedIn' }).getAttribute('href')).toContain(
      'company/example',
    )
  })

  it('renders nothing without a member or without any link', () => {
    const { container: none } = render(<WebUiSocialLinks member={null} />)
    expect(none.innerHTML).toBe('')
    const { container: empty } = render(<WebUiSocialLinks member={{ facebook: '' }} />)
    expect(empty.innerHTML).toBe('')
  })
})
