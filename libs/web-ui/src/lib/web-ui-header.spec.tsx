import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebUiHeader } from './web-ui-header'

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('WebUiHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      writable: true,
      value: '',
    })
  })

  it('preserves a saved light theme instead of overwriting it with the SSR fallback', async () => {
    localStorage.setItem('theme', 'light')

    render(
      <WebUiHeader
        logo="/logo.png"
        icon="/icon.png"
        siteName="Demo Site"
        navigation={[{ name: 'Pricing', href: '/pricing' }]}
        isAuthenticated={false}
      />,
    )

    await waitFor(() => {
      expect(localStorage.getItem('theme')).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(screen.getByLabelText('Switch to dark mode')).toBeTruthy()
    })
  })

  it('uses an account menu instead of top-level authenticated navigation', async () => {
    render(
      <WebUiHeader
        logo="/logo.png"
        icon="/icon.png"
        siteName="Demo Site"
        navigation={[{ name: 'Pricing', href: '/pricing' }]}
        isAuthenticated={true}
        userName="Ada Lovelace"
        userEmail="ada@example.com"
        isSuperAdmin={true}
        canViewBilling={true}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Pricing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Open account menu'))

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Dashboard/ })).toHaveAttribute(
      'href',
      '/members/dashboard',
    )
    expect(screen.getByRole('menuitem', { name: /My Account/ })).toHaveAttribute(
      'href',
      '/settings/profile',
    )
    expect(screen.getByRole('menuitem', { name: /Billing/ })).toHaveAttribute(
      'href',
      '/settings/billing',
    )
    expect(screen.getByRole('menuitem', { name: /Admin Console/ })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(screen.getByRole('menuitem', { name: /Logout/ })).toHaveAttribute('href', '/logout')
    expect(
      screen.getByRole('menuitem', { name: /Switch to Light Mode|Switch to Dark Mode/ }),
    ).toBeInTheDocument()
  })

  it('hides billing from authenticated users without billing visibility', async () => {
    render(
      <WebUiHeader
        logo="/logo.png"
        icon="/icon.png"
        siteName="Demo Site"
        navigation={[]}
        isAuthenticated={true}
        userName="Member User"
        userEmail="member@example.com"
      />,
    )

    fireEvent.click(screen.getByLabelText('Open account menu'))

    expect(await screen.findByRole('menuitem', { name: /Dashboard/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Billing/ })).not.toBeInTheDocument()
  })

  it('renders authenticated mobile account links and avatar image', async () => {
    render(
      <WebUiHeader
        logo="/logo.png"
        icon="/icon.png"
        siteName="Demo Site"
        navigation={[]}
        isAuthenticated={true}
        userName="Mobile User"
        userEmail="mobile@example.com"
        userAvatarUrl="/avatar.png"
        canViewBilling={true}
      />,
    )

    fireEvent.click(screen.getByText('Open main menu'))

    expect(await screen.findByText('Mobile User')).toBeInTheDocument()
    expect(document.querySelector('img[src="/avatar.png"]')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Billing/ })).toHaveAttribute(
      'href',
      '/settings/billing',
    )
    expect(screen.getByRole('link', { name: /Logout/ })).toHaveAttribute('href', '/logout')

    fireEvent.click(screen.getByRole('button', { name: /Switch to Light Mode/ }))

    await waitFor(() => {
      expect(localStorage.getItem('theme')).toBe('light')
    })
  })
})
