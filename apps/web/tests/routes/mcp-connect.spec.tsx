import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import McpConnectPage, {
  action,
  headers,
  loader,
  type McpConsentDetails,
} from '../../app/routes/mcp-connect'

let loaderData: any = {}
let actionData: any

vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useLoaderData: () => loaderData,
    useActionData: () => actionData,
  }
})

// Obviously fake placeholder; the API is mocked and never verifies it.
const COOKIE = '__session=fake-session'

const consent = (overrides: Partial<McpConsentDetails> = {}): McpConsentDetails => ({
  request: 'req-1',
  csrfToken: 'csrf-1',
  expiresAt: '2026-01-01T00:00:00.000Z',
  client: { name: 'Some MCP Client', verified: false },
  redirectUri: 'https://client.example.com/callback',
  redirectHost: 'client.example.com',
  account: { name: 'Ada Lovelace', email: 'ada@example.com' },
  organizations: [{ id: 'org-1', name: 'Acme' }],
  selectedOrganizationId: null,
  ...overrides,
})

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function thrown(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise
  } catch (error) {
    return error as Response
  }
  throw new Error('expected a thrown response')
}

describe('mcp-connect consent route', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    process.env.VITE_COOKIE_NAME = '__session'
    process.env.VITE_API_URL = 'https://api.example.com'
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    loaderData = {}
    actionData = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('headers', () => {
    it('forbids framing and caching', () => {
      expect(headers()).toEqual(
        expect.objectContaining({
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "frame-ancestors 'none'",
          'Cache-Control': 'no-store',
        }),
      )
    })

    it('keeps the URL on this site without making the form POST send Origin: null', () => {
      // no-referrer makes Chrome send `Origin: null` on the consent form's POST, which React
      // Router's action CSRF check rejects with a 400. same-origin keeps a real Origin.
      expect(headers()['Referrer-Policy']).toBe('same-origin')
    })
  })

  describe('loader', () => {
    it('sends a request with no pending id home', async () => {
      const response = await thrown(
        loader({ request: new Request('https://app.example.com/mcp-connect') } as any),
      )
      expect(response.headers.get('Location')).toBe('/')
    })

    it('sends a signed-out user to login and back', async () => {
      const response = await thrown(
        loader({
          request: new Request('https://app.example.com/mcp-connect?request=req-1'),
        } as any),
      )
      expect(response.headers.get('Location')).toBe(
        `/login?return_url=${encodeURIComponent('/mcp-connect?request=req-1')}`,
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('loads the pending request from the API with the session cookie', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, consent()))
      const result = await loader({
        request: new Request('https://app.example.com/mcp-connect?request=req-1', {
          headers: { cookie: COOKIE },
        }),
      } as any)

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/mcp/authorize/pending?request=req-1',
        expect.objectContaining({ headers: expect.objectContaining({ cookie: COOKIE }) }),
      )
      expect(result).toEqual({ status: 'ready', consent: consent() })
    })

    it('reports an expired request', async () => {
      fetchMock.mockResolvedValue(jsonResponse(404, { error: 'invalid_request' }))
      const result = await loader({
        request: new Request('https://app.example.com/mcp-connect?request=req-1', {
          headers: { cookie: COOKIE },
        }),
      } as any)
      expect(result).toEqual({ status: 'error', message: expect.stringContaining('expired') })
    })

    it('reports a request that belongs to another session', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, { error_description: 'belongs to a different session' }),
      )
      const result = await loader({
        request: new Request('https://app.example.com/mcp-connect?request=req-1', {
          headers: { cookie: COOKIE },
        }),
      } as any)
      expect(result).toEqual({ status: 'error', message: 'belongs to a different session' })
    })

    it('sends the user to login when the API says the session is gone', async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { error: 'login_required' }))
      const response = await thrown(
        loader({
          request: new Request('https://app.example.com/mcp-connect?request=req-1', {
            headers: { cookie: COOKIE },
          }),
        } as any),
      )
      expect(response.headers.get('Location')).toContain('/login?return_url=')
    })
  })

  describe('action', () => {
    const post = (fields: Record<string, string>, cookie: string | null = COOKIE) =>
      new Request('https://app.example.com/mcp-connect?request=req-1', {
        method: 'POST',
        headers: cookie ? { cookie } : {},
        body: new URLSearchParams(fields),
      })

    it('forwards the decision and CSRF token, then follows the API redirect', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { redirect_to: 'https://client.example.com/callback?code=c&state=s' }),
      )

      const response = (await action({
        request: post({
          request: 'req-1',
          csrf_token: 'csrf-1',
          decision: 'approve',
          organization_id: 'org-1',
        }),
      } as any)) as Response

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.example.com/api/mcp/authorize/decision')
      expect(init.method).toBe('POST')
      expect(init.headers.cookie).toBe(COOKIE)
      expect(JSON.parse(init.body)).toEqual({
        request: 'req-1',
        csrf_token: 'csrf-1',
        decision: 'approve',
        organization_id: 'org-1',
      })
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(
        'https://client.example.com/callback?code=c&state=s',
      )
    })

    it('shows the API error when the decision is refused', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, { error_description: 'Invalid or missing CSRF token' }),
      )
      const result = await action({
        request: post({ request: 'req-1', csrf_token: 'nope', decision: 'approve' }),
      } as any)
      expect(result).toEqual({ error: 'Invalid or missing CSRF token' })
    })

    it('does not call the API without a session', async () => {
      const response = (await action({
        request: post({ request: 'req-1', decision: 'approve' }, null),
      } as any)) as Response
      expect(response.headers.get('Location')).toContain('/login?return_url=')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('page', () => {
    it('shows the unverified client, the redirect host, the account and the organization', () => {
      loaderData = { status: 'ready', consent: consent() }
      render(<McpConnectPage />)

      expect(screen.getByText('Some MCP Client')).toBeInTheDocument()
      expect(screen.getByText(/Unverified/)).toBeInTheDocument()
      expect(screen.getByText('client.example.com')).toBeInTheDocument()
      expect(screen.getByText('ada@example.com')).toBeInTheDocument()
      expect(screen.getByText('Acme')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('value', 'approve')
      expect(screen.getByRole('button', { name: 'Deny' })).toHaveAttribute('value', 'deny')

      const form = screen
        .getByRole('button', { name: 'Approve' })
        .closest('form') as HTMLFormElement
      expect(form.method).toBe('post')
      const fields = new FormData(form)
      expect(fields.get('request')).toBe('req-1')
      expect(fields.get('csrf_token')).toBe('csrf-1')
      expect(fields.get('organization_id')).toBe('org-1')
    })

    it('lets a multi-organization user choose, preselecting a requested organization', () => {
      loaderData = {
        status: 'ready',
        consent: consent({
          organizations: [
            { id: 'org-1', name: 'Acme' },
            { id: 'org-2', name: 'Globex' },
          ],
          selectedOrganizationId: 'org-2',
        }),
      }
      render(<McpConnectPage />)

      const radios = screen.getAllByRole('radio') as HTMLInputElement[]
      expect(radios.map(r => r.value)).toEqual(['org-1', 'org-2'])
      expect(radios.map(r => r.checked)).toEqual([false, true])
      expect(radios.every(r => r.required)).toBe(true)
    })

    it('tells an organization-less user only their account is shared', () => {
      loaderData = { status: 'ready', consent: consent({ organizations: [] }) }
      render(<McpConnectPage />)
      expect(screen.getByText(/You don't belong to an organization/)).toBeInTheDocument()
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    })

    it('shows the loader error and no form', () => {
      loaderData = { status: 'error', message: 'This connection request has expired.' }
      render(<McpConnectPage />)
      expect(screen.getByText('This connection request has expired.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    })

    it('shows a refused decision ahead of the loader result', () => {
      loaderData = { status: 'error', message: 'expired' }
      actionData = { error: 'Invalid or missing CSRF token' }
      render(<McpConnectPage />)
      expect(screen.getByText('Invalid or missing CSRF token')).toBeInTheDocument()
    })
  })
})
