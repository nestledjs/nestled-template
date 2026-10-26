import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  CIMD_MAX_BYTES,
  ClientMetadataError,
  ClientMetadataResolver,
  createBoundedLookup,
  createPinnedFetcher,
  pinnedLookup,
  type FetchedDocument,
  isAcceptableRedirectUri,
  isClientMetadataDocumentUrl,
  isPublicAddress,
  isRegisteredRedirectUri,
  parseClientMetadataDocument,
} from './mcp-client-metadata'

const CLIENT_ID = 'https://client.example.com/oauth/client.json'

const validDocument = (overrides: Record<string, unknown> = {}) => ({
  client_id: CLIENT_ID,
  client_name: 'Example Client',
  redirect_uris: ['https://client.example.com/callback', 'http://127.0.0.1:3000/callback'],
  grant_types: ['authorization_code'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  ...overrides,
})

function fetched(body: unknown, init: { status?: number; cacheControl?: string } = {}) {
  return {
    status: init.status ?? 200,
    cacheControl: init.cacheControl ?? null,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  } satisfies FetchedDocument
}

describe('Client ID Metadata Documents', () => {
  describe('isClientMetadataDocumentUrl', () => {
    it.each([
      CLIENT_ID,
      'https://client.example.com/client',
      'https://client.example.com:8443/oauth/client.json',
    ])('accepts %s', url => {
      expect(isClientMetadataDocumentUrl(url)).toBe(true)
    })

    it.each([
      ['a DCR client id', '6f1c0d8e2a7b4c3d9e8f7a6b5c4d3e2f'],
      ['plain http', 'http://client.example.com/client.json'],
      ['no path', 'https://client.example.com'],
      ['a root path', 'https://client.example.com/'],
      ['a fragment', 'https://client.example.com/client.json#x'],
      ['a bare trailing #', 'https://client.example.com/client.json#'],
      ['credentials', 'https://user:pass@client.example.com/client.json'],
      ['a dot segment', 'https://client.example.com/a/../client.json'],
      ['a non-canonical host', 'https://CLIENT.example.com/client.json'],
    ])('rejects %s', (_label, url) => {
      expect(isClientMetadataDocumentUrl(url)).toBe(false)
    })
  })

  describe('redirect URIs', () => {
    it.each([
      'https://client.example.com/callback',
      'http://localhost:8080/callback',
      'http://127.0.0.1/callback',
      'http://[::1]:9000/callback',
      'cursor://example.app/oauth/callback',
    ])('accepts %s', uri => {
      expect(isAcceptableRedirectUri(uri)).toBe(true)
    })

    it.each([
      'http://client.example.com/callback',
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'https://client.example.com/callback#frag',
      'https://client.example.com/callback#',
      'cursor://example.app/oauth#',
      'not a url',
    ])('rejects %s', uri => {
      expect(isAcceptableRedirectUri(uri)).toBe(false)
    })

    it('matches registered redirect URIs exactly, except the port of a loopback redirect', () => {
      const registered = ['https://client.example.com/callback', 'http://127.0.0.1:3000/callback']

      expect(isRegisteredRedirectUri(registered, 'https://client.example.com/callback')).toBe(true)
      expect(isRegisteredRedirectUri(registered, 'https://client.example.com/callback/')).toBe(
        false,
      )
      expect(isRegisteredRedirectUri(registered, 'https://client.example.com:444/callback')).toBe(
        false,
      )
      expect(isRegisteredRedirectUri(registered, 'http://127.0.0.1:54321/callback')).toBe(true)
      expect(isRegisteredRedirectUri(registered, 'http://localhost:3000/callback')).toBe(false)
      expect(isRegisteredRedirectUri(registered, 'http://127.0.0.1:3000/other')).toBe(false)
    })
  })

  describe('isPublicAddress', () => {
    it.each(['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'])('allows %s', address => {
      expect(isPublicAddress(address)).toBe(true)
    })

    it.each([
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      '::a00:5', // IPv4-compatible 10.0.0.5
      '::7f00:1', // IPv4-compatible 127.0.0.1
      '64:ff9b:1::a00:5', // NAT64 local-use
      '2002:a00:5::1', // 6to4 of 10.0.0.5
      'fec0::1', // site-local
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      'not-an-ip',
    ])('blocks %s', address => {
      expect(isPublicAddress(address)).toBe(false)
    })
  })

  describe('parseClientMetadataDocument', () => {
    it('returns the client for a valid document', () => {
      expect(parseClientMetadataDocument(CLIENT_ID, JSON.stringify(validDocument()))).toEqual({
        clientId: CLIENT_ID,
        clientName: 'Example Client',
        redirectUris: ['https://client.example.com/callback', 'http://127.0.0.1:3000/callback'],
      })
    })

    it.each([
      ['invalid JSON', '{'],
      ['a non-object', '[]'],
      [
        'a mismatched client_id',
        JSON.stringify(validDocument({ client_id: 'https://other.example.com/c.json' })),
      ],
      ['a missing client_name', JSON.stringify(validDocument({ client_name: undefined }))],
      ['no redirect_uris', JSON.stringify(validDocument({ redirect_uris: [] }))],
      [
        'an unsafe redirect_uri',
        JSON.stringify(validDocument({ redirect_uris: ['http://evil.example.com/cb'] })),
      ],
      [
        'a confidential auth method',
        JSON.stringify(validDocument({ token_endpoint_auth_method: 'private_key_jwt' })),
      ],
    ])('rejects %s', (_label, raw) => {
      expect(() => parseClientMetadataDocument(CLIENT_ID, raw)).toThrow(ClientMetadataError)
    })
  })

  describe('ClientMetadataResolver', () => {
    const PUBLIC_ADDRESS = '93.184.215.14'
    const publicHost = jest.fn(async () => [PUBLIC_ADDRESS])
    let now: number
    let fetchMock: jest.Mock

    const resolver = () => new ClientMetadataResolver(fetchMock as any, publicHost, () => now)

    beforeEach(() => {
      now = 1_000_000
      fetchMock = jest.fn(async () => fetched(validDocument()))
      publicHost.mockClear()
    })

    it('answers a lookup that fails as a metadata error, without fetching', async () => {
      const fetchDocument = jest.fn()
      const instance = new ClientMetadataResolver(fetchDocument, async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
      })

      await expect(instance.resolve(CLIENT_ID)).rejects.toThrow('could not be resolved')
      expect(fetchDocument).not.toHaveBeenCalled()
    })

    it('fetches the document from the address it checked, and returns the client', async () => {
      await expect(resolver().resolve(CLIENT_ID)).resolves.toEqual(
        expect.objectContaining({ clientId: CLIENT_ID, clientName: 'Example Client' }),
      )
      expect(publicHost).toHaveBeenCalledTimes(1)
      expect(publicHost).toHaveBeenCalledWith('client.example.com')
      expect(fetchMock).toHaveBeenCalledWith(new URL(CLIENT_ID), PUBLIC_ADDRESS)
    })

    it('resolves the host once, so a later DNS answer cannot redirect the connection', async () => {
      // A rebinding name: public on the first answer, internal on every one after it.
      const rebinding = jest
        .fn()
        .mockResolvedValueOnce([PUBLIC_ADDRESS])
        .mockResolvedValue(['127.0.0.1'])
      const instance = new ClientMetadataResolver(fetchMock as any, rebinding, () => now)

      await instance.resolve(CLIENT_ID)

      expect(rebinding).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][1]).toBe(PUBLIC_ADDRESS)
    })

    it('refuses a host whose answers mix public and private addresses', async () => {
      const instance = new ClientMetadataResolver(fetchMock as any, async () => [
        PUBLIC_ADDRESS,
        '10.0.0.5',
      ])

      await expect(instance.resolve(CLIENT_ID)).rejects.toThrow('not a public address')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('caches a document for its max-age and fetches it again once that has passed', async () => {
      fetchMock.mockImplementation(async () =>
        fetched(validDocument(), { cacheControl: 'max-age=60' }),
      )
      const instance = resolver()

      await instance.resolve(CLIENT_ID)
      now += 59_000
      await instance.resolve(CLIENT_ID)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      now += 2_000
      await instance.resolve(CLIENT_ID)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not cache a document served with no-store', async () => {
      fetchMock.mockImplementation(async () =>
        fetched(validDocument(), { cacheControl: 'no-store' }),
      )
      const instance = resolver()

      await instance.resolve(CLIENT_ID)
      await instance.resolve(CLIENT_ID)

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('refuses a host that resolves to a private address, without fetching', async () => {
      const instance = new ClientMetadataResolver(fetchMock as any, async () => ['10.0.0.5'])

      await expect(instance.resolve(CLIENT_ID)).rejects.toThrow('not a public address')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuses an IP-literal host on a private network, without resolving or fetching', async () => {
      await expect(resolver().resolve('https://169.254.169.254/latest/meta-data')).rejects.toThrow(
        ClientMetadataError,
      )
      await expect(resolver().resolve('https://[::1]/client.json')).rejects.toThrow(
        ClientMetadataError,
      )
      expect(fetchMock).not.toHaveBeenCalled()
      expect(publicHost).not.toHaveBeenCalled()
    })

    it('refuses a client_id that is not a metadata document URL', async () => {
      await expect(resolver().resolve('http://client.example.com/client.json')).rejects.toThrow(
        ClientMetadataError,
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each([301, 404, 500])('refuses a %s response, without following redirects', async status => {
      fetchMock.mockImplementation(async () => fetched('', { status }))

      await expect(resolver().resolve(CLIENT_ID)).rejects.toThrow(`fetch failed (${status})`)
    })

    it('refuses a fetch that fails, such as a timeout', async () => {
      fetchMock.mockRejectedValue(new Error('The operation was aborted due to timeout'))

      await expect(resolver().resolve(CLIENT_ID)).rejects.toThrow('could not be fetched')
    })

    it('passes on a size-limit rejection from the fetcher', async () => {
      fetchMock.mockRejectedValue(new ClientMetadataError('Client metadata document is too large'))

      await expect(resolver().resolve(CLIENT_ID)).rejects.toThrow('too large')
    })

    it('refuses a document whose client_id is not the URL it was fetched from', async () => {
      fetchMock.mockImplementation(async () =>
        fetched(validDocument({ client_id: 'https://attacker.example.com/client.json' })),
      )

      await expect(resolver().resolve(CLIENT_ID)).rejects.toThrow('does not match its URL')
    })
  })

  describe('pinnedLookup', () => {
    it('answers every lookup with the pinned address, in either callback shape', () => {
      const lookup = pinnedLookup('93.184.215.14') as any
      const single = jest.fn()
      const all = jest.fn()

      lookup('client.example.com', {}, single)
      lookup('client.example.com', { all: true }, all)

      expect(single).toHaveBeenCalledWith(null, '93.184.215.14', 4)
      expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.215.14', family: 4 }])
    })

    it('reports the IPv6 family for an IPv6 address', () => {
      const callback = jest.fn()

      ;(pinnedLookup('2606:2800:21f:cb07:6820:80da:af6b:8b2c') as any)('h', {}, callback)

      expect(callback).toHaveBeenCalledWith(null, '2606:2800:21f:cb07:6820:80da:af6b:8b2c', 6)
    })
  })

  describe('createPinnedFetcher', () => {
    let server: Server
    let port: number
    let received: { host?: string; url?: string }
    let reply: (res: import('node:http').ServerResponse) => void

    beforeAll(async () => {
      server = createServer((req, res) => {
        received = { host: req.headers.host, url: req.url }
        reply(res)
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      port = (server.address() as AddressInfo).port
    })

    afterAll(async () => {
      await new Promise(resolve => server.close(resolve))
    })

    beforeEach(() => {
      received = {}
      reply = res => {
        res.setHeader('cache-control', 'max-age=120')
        res.end(JSON.stringify(validDocument()))
      }
    })

    // The real fetcher speaks HTTPS; plain HTTP to a local server shows the same connection logic:
    // the name in the URL is never looked up, the socket goes to the pinned address, and the
    // request still names the URL's host.
    const fetchViaHttp = createPinnedFetcher(httpRequest as any)
    const urlFor = (path: string) => new URL(`http://unresolvable.invalid:${port}${path}`)

    it('connects to the pinned address and sends the original Host', async () => {
      const result = await fetchViaHttp(urlFor('/oauth/client.json?v=1'), '127.0.0.1')

      expect(result).toEqual({
        status: 200,
        cacheControl: 'max-age=120',
        body: JSON.stringify(validDocument()),
      })
      expect(received).toEqual({
        host: `unresolvable.invalid:${port}`,
        url: '/oauth/client.json?v=1',
      })
    })

    it('returns a redirect as its status instead of following it', async () => {
      reply = res => {
        res.statusCode = 302
        res.setHeader('location', 'http://127.0.0.1/internal')
        res.end()
      }

      await expect(fetchViaHttp(urlFor('/client.json'), '127.0.0.1')).resolves.toEqual(
        expect.objectContaining({ status: 302 }),
      )
    })

    it('stops reading a body larger than the size limit', async () => {
      reply = res => {
        res.write('x'.repeat(CIMD_MAX_BYTES))
        res.end('more')
      }

      await expect(fetchViaHttp(urlFor('/client.json'), '127.0.0.1')).rejects.toThrow('too large')
    })

    it('refuses a declared length over the size limit before reading', async () => {
      reply = res => {
        res.setHeader('content-length', String(CIMD_MAX_BYTES + 1))
        res.end()
      }

      await expect(fetchViaHttp(urlFor('/client.json'), '127.0.0.1')).rejects.toThrow('too large')
    })

    it('sets SNI to the host name, and leaves it out for an IP literal', async () => {
      const request = jest.fn((_options: any, _callback: any) => ({
        on: jest.fn(),
        end: jest.fn(),
      }))
      const fetchVia = createPinnedFetcher(request as any)

      void fetchVia(new URL('https://client.example.com/client.json'), '93.184.215.14')
      void fetchVia(new URL('https://93.184.215.14/client.json'), '93.184.215.14')

      expect(request.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          hostname: 'client.example.com',
          servername: 'client.example.com',
          headers: expect.objectContaining({ Host: 'client.example.com' }),
          agent: false,
        }),
      )
      expect(request.mock.calls[1][0].servername).toBeUndefined()
    })
  })

  describe('createBoundedLookup', () => {
    it('gives up on a lookup that takes longer than the timeout', async () => {
      jest.useFakeTimers()
      try {
        const lookup = createBoundedLookup(() => new Promise(() => undefined), {
          timeoutMs: 1_000,
          maxConcurrent: 2,
        })
        const pending = lookup('slow.example.com')
        jest.advanceTimersByTime(1_000)

        await expect(pending).rejects.toThrow('timed out')
      } finally {
        jest.useRealTimers()
      }
    })

    it('refuses a lookup over the concurrency cap, counting timed-out lookups until they settle', async () => {
      const settle: Array<(addresses: string[]) => void> = []
      const resolve = jest.fn(() => new Promise<string[]>(done => settle.push(done)))
      const lookup = createBoundedLookup(resolve, { timeoutMs: 5, maxConcurrent: 2 })

      const first = lookup('a.example.com')
      const second = lookup('b.example.com')
      // Both time out, but their lookups still hold threads.
      await expect(first).rejects.toThrow('timed out')
      await expect(second).rejects.toThrow('timed out')
      await expect(lookup('c.example.com')).rejects.toThrow('Too many')
      expect(resolve).toHaveBeenCalledTimes(2)

      settle[0](['93.184.215.14'])
      await Promise.resolve()
      await Promise.resolve()
      const third = lookup('c.example.com')
      settle[2](['93.184.215.14'])
      await expect(third).resolves.toEqual(['93.184.215.14'])
    })
  })
})
