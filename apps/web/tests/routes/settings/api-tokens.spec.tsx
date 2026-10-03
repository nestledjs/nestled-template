import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestRouter } from '../../helpers/createTestRouter'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ApiTokensSettings from '../../../app/routes/settings/api-tokens'

const mockUseReadQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useReadQuery: (...args: unknown[]) => mockUseReadQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}))

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useLoaderData: () => ({ tokensQueryRef: {} }),
  }
})

vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    GenerateApiToken: { kind: 'Document', definitions: [] },
    RevokeApiToken: { kind: 'Document', definitions: [] },
    ListApiTokens: { kind: 'Document', definitions: [] },
  }
})

vi.mock('../../../app/routes/settings/_mcp-shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../app/routes/settings/_mcp-shared')>()
  return {
    ...actual,
    MCP_SERVER_URL: 'http://localhost:3000/api/mcp',
    buildClaudeConfig: (token: string) =>
      JSON.stringify({
        mcpServers: { nestled: { headers: { Authorization: `Bearer ${token}` } } },
      }),
    TokenMeta: ({ token }: any) => <span data-testid="token-meta">{token.createdAt}</span>,
    NewTokenDisplay: ({ name, onDismiss }: any) => (
      <div data-testid="new-token-display">
        <span>Token Created: {name}</span>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    ),
  }
})

const mockGenerateToken = vi.fn()
const mockRevokeToken = vi.fn()

function renderPage() {
  const Router = createTestRouter([{ path: '/', Component: ApiTokensSettings }])
  return render(<Router initialEntries={['/']} />)
}

describe('ApiTokensSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseReadQuery.mockReturnValue({ data: { listApiTokens: [] } })

    // useMutation is called twice per render (generate + revoke); cycle to handle re-renders
    let callIndex = 0
    const responses: [typeof mockGenerateToken | typeof mockRevokeToken, ...unknown[]][] = [
      [mockGenerateToken, { loading: false }],
      [mockRevokeToken],
    ]
    mockUseMutation.mockImplementation(() => responses[callIndex++ % 2])
  })

  it('renders the page header and create button', () => {
    renderPage()
    expect(screen.getByText('API Tokens')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create token/i })).toBeInTheDocument()
  })

  it('renders Claude Desktop template section', () => {
    renderPage()
    expect(screen.getByText('Claude Desktop Template')).toBeInTheDocument()
    expect(screen.getByText('MCP server URL:')).toBeInTheDocument()
  })

  it('renders available tools section', () => {
    renderPage()
    expect(screen.getByText('Available Tools')).toBeInTheDocument()
    expect(screen.getByText('get_profile')).toBeInTheDocument()
    expect(screen.getByText('list_organizations')).toBeInTheDocument()
  })

  it('shows empty state when no active tokens', () => {
    renderPage()
    expect(screen.getByText('No active personal API tokens.')).toBeInTheDocument()
  })

  it('renders active tokens', () => {
    mockUseReadQuery.mockReturnValue({
      data: {
        listApiTokens: [
          {
            id: 'tok-1',
            name: 'My Token',
            organizationId: null,
            revoked: false,
            createdAt: null,
            lastUsedAt: null,
            expiresAt: null,
          },
        ],
      },
    })
    renderPage()
    expect(screen.getByText('My Token')).toBeInTheDocument()
  })

  it('opens create modal on button click', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /create token/i }))
    expect(screen.getByPlaceholderText('MacBook Pro CLI')).toBeInTheDocument()
    expect(
      screen.getByText('This token authenticates as your personal user account.'),
    ).toBeInTheDocument()
  })

  it('shows inline token display after successful creation', async () => {
    mockGenerateToken.mockResolvedValue({
      data: { generateApiToken: { token: 'tok_abc123' } },
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /create token/i }))
    const nameInput = screen.getByPlaceholderText('MacBook Pro CLI')
    await userEvent.type(nameInput, 'My Key')
    await userEvent.click(
      screen
        .getAllByRole('button', { name: /^create token$/i })
        .find(el => el.getAttribute('type') === 'submit')!,
    )
    expect(await screen.findByTestId('new-token-display')).toBeInTheDocument()
    expect(screen.getByText(/Token Created: My Key/)).toBeInTheDocument()
  })

  it('shows revoked tokens in collapsible section', () => {
    mockUseReadQuery.mockReturnValue({
      data: {
        listApiTokens: [
          {
            id: 'tok-2',
            name: 'Old Token',
            organizationId: null,
            revoked: true,
            createdAt: null,
            lastUsedAt: null,
            expiresAt: null,
          },
        ],
      },
    })
    renderPage()
    expect(screen.getByText(/Revoked Tokens \(1\)/)).toBeInTheDocument()
  })
})
