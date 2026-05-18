import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestRouter } from '../helpers/createTestRouter'
import AdminAnalyticsPage from '../../app/routes/admin/analytics/_index'
import ForceLogoutRoute, { loader as forceLogoutLoader } from '../../app/routes/force-logout'
import McpConnectPage, { loader as mcpConnectLoader } from '../../app/routes/mcp-connect'

const useQuery = vi.fn()
let loaderData: any = {}

vi.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}))

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useLoaderData: () => loaderData,
  }
})

vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    AdminAnalytics: { kind: 'Document', definitions: [] },
    MyOrganizations: { kind: 'Document', definitions: [] },
  }
})

describe('additional route coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loaderData = {}
  })

  it('clears auth cookies and redirects from force logout loader', async () => {
    process.env.VITE_COOKIE_NAME = '__session'
    process.env.VITE_COOKIE_DOMAIN = 'example.com'

    const response = await forceLogoutLoader({
      request: new Request('https://app.example.com/force-logout?return_url=/settings'),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login?return_url=%2Fsettings')
    expect(response.headers.getSetCookie()).toHaveLength(2)

    const { container } = render(<ForceLogoutRoute />)
    expect(container.innerHTML).toBe('')
  })

  it('loads and renders MCP organization selection', async () => {
    const tokenPayload = Buffer.from(JSON.stringify({ iat: 1 })).toString('base64url')
    const request = new Request(
      'https://app.example.com/mcp-connect?back=https://mcp.example.com/cb',
      {
        headers: { cookie: `__session=header.${tokenPayload}.signature` },
      },
    )

    await expect(mcpConnectLoader({ request, params: {}, context: {} } as any)).resolves.toEqual({
      back: 'https://mcp.example.com/cb',
    })

    loaderData = { back: 'https://mcp.example.com/cb' }
    useQuery.mockReturnValue({
      data: { myOrganizations: [{ id: 'org-1', name: 'Acme', logo: null }] },
      loading: false,
    })

    render(<McpConnectPage />)
    fireEvent.click(screen.getByRole('button', { name: /Acme/ }))
    expect(screen.getByRole('button', { name: /Acme/ })).toBeInTheDocument()
  })

  it('renders admin analytics metrics and errors', () => {
    const refetch = vi.fn()
    useQuery.mockReturnValue({
      refetch,
      loading: false,
      error: new Error('API unavailable'),
      data: {
        adminAnalytics: {
          dailyActiveUsers: 12,
          dauChange: 5,
          monthlyActiveUsers: 1234,
          mauChange: -2,
          newUsersToday: 3,
          avgSessionDuration: 1500,
          avgApiResponseTime: 95,
          totalGraphQLOperations: 9876,
          errorRate: 0.5,
          systemUptime: 99.9,
          topEndpoints: [{ name: 'users', requests: 100, avgResponseTime: 42, errorRate: 0.2 }],
          featureUsage: [{ name: 'billing', count: 8, uniqueUsers: 4 }],
        },
      },
    })

    const ReactRouterStub = createTestRouter([
      { path: '/admin/analytics', Component: AdminAnalyticsPage },
    ])
    render(<ReactRouterStub initialEntries={['/admin/analytics']} />)

    expect(screen.getByText('Platform Analytics')).toBeInTheDocument()
    expect(screen.getByText('API unavailable')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Refresh Data/ }))
    expect(refetch).toHaveBeenCalled()
  })
})
