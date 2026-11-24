// @vitest-environment node
import { createServer, get, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import express from 'express'
import {
  createRequestHandler,
  data,
  Outlet,
  redirect,
  RouterContextProvider,
  UNSAFE_withComponentProps as withComponentProps,
  UNSAFE_withErrorBoundaryProps as withErrorBoundaryProps,
  type ServerBuild,
} from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetApiOutageMemory } from '@nestled-template/shared/apollo'
import * as entryServer from '../../app/entry.server'
import * as rootModule from '../../app/root'
import { requireSession } from '../../app/session/session-middleware.server'
import { UNAUTHENTICATED_RESULT } from '../helpers/api-rejection'

// Cache-Control as it leaves the production server: express as in server.js, React
// Router's request handler in production mode, the real entry.server.tsx and root route, over a real
// HTTP connection. Only the API is stubbed. (@react-router/express is written out here: loaded by
// Node, it would bring a second copy of react-router, whose context provider this one refuses.)

const PRIVATE = 'private, no-store'

type Module = Record<string, unknown>

const routes: Record<string, { path: string; parentId: string; module: Module }> = {
  'routes/private': {
    path: '',
    parentId: 'root',
    module: { middleware: [requireSession], loader: () => null, default: () => <Outlet /> },
  },
  'routes/members': {
    path: 'members',
    parentId: 'routes/private',
    module: { loader: () => ({ ok: true }), default: () => <p>Members</p> },
  },
  'routes/public': {
    path: 'public',
    parentId: 'root',
    module: { loader: () => ({ ok: true }), default: () => <p>Public</p> },
  },
  'routes/shared': {
    path: 'shared',
    parentId: 'root',
    module: {
      loader: () => ({ ok: true }),
      headers: () => ({ 'Cache-Control': 'public, max-age=600' }),
      default: () => <p>Shared</p>,
    },
  },
  'routes/strict': {
    path: 'strict',
    parentId: 'root',
    module: {
      loader: () => ({ ok: true }),
      headers: () => ({ 'Cache-Control': 'no-store' }),
      default: () => <p>Strict</p>,
    },
  },
  'routes/away': {
    path: 'away',
    parentId: 'root',
    module: {
      loader: () => {
        throw redirect('/public')
      },
      default: () => null,
    },
  },
  'routes/broken': {
    path: 'broken',
    parentId: 'root',
    module: {
      loader: () => {
        throw new Error('boom')
      },
      default: () => null,
    },
  },
  'routes/missing': {
    path: 'missing',
    parentId: 'root',
    module: {
      loader: () => {
        throw data(null, { status: 404 })
      },
      default: () => null,
    },
  },
  'routes/resource': {
    path: 'resource',
    parentId: 'root',
    module: { loader: () => new Response('r') },
  },
  'routes/resource-cached': {
    path: 'resource-cached',
    parentId: 'root',
    module: {
      loader: () => new Response('r', { headers: { 'Cache-Control': 'public, max-age=60' } }),
    },
  },
  'routes/proxied': {
    path: 'proxied',
    parentId: 'root',
    // Immutable headers, as on a response that came from `fetch()`.
    module: { loader: () => Response.redirect('https://example.com/elsewhere', 302) },
  },
  'routes/healthz': {
    path: 'healthz',
    parentId: 'root',
    module: { loader: () => new Response('ok', { headers: { 'Cache-Control': 'no-store' } }) },
  },
}

function build(): ServerBuild {
  const manifest = (id: string, path: string, module: Module, parentId?: string) => ({
    id,
    path,
    parentId,
    hasAction: false,
    hasLoader: true,
    hasClientAction: false,
    hasClientLoader: false,
    hasClientMiddleware: false,
    hasErrorBoundary: id === 'root',
    hasDefaultExport: 'default' in module,
    module: `/${id}.js`,
    imports: [],
    css: [],
  })
  const root = {
    ...rootModule,
    default: withComponentProps(rootModule.default),
    ErrorBoundary: withErrorBoundaryProps(rootModule.ErrorBoundary),
  }
  const entries = Object.entries(routes)
  return {
    entry: { module: entryServer },
    routes: {
      root: { id: 'root', path: '', module: root },
      ...Object.fromEntries(entries.map(([id, route]) => [id, { id, ...route }])),
    },
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: {
        root: manifest('root', '', root),
        ...Object.fromEntries(
          entries.map(([id, { path, module, parentId }]) => [
            id,
            manifest(id, path, module, parentId),
          ]),
        ),
      },
      url: '/manifest.js',
      version: 'test',
    },
    publicPath: '/',
    assetsBuildDirectory: 'build/client',
    future: { v8_middleware: true },
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: 'initial', manifestPath: '/__manifest' },
  } as unknown as ServerBuild
}

const payload = (exp: number) =>
  Buffer.from(JSON.stringify({ sub: 'user-1', exp })).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const LIVE = `__session=h.${payload(now + 3600)}.s`
const EXPIRED = `__session=h.${payload(now - 60)}.s`

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const USER = { __typename: 'User', id: 'user-1', firstName: 'Ada', emails: [] }

let api: () => Promise<Response>
let server: Server

beforeAll(async () => {
  const app = express()
  const handler = createRequestHandler(build(), 'production')
  app.use(async (incoming, outgoing) => {
    const response = await handler(
      new Request(`http://localhost${incoming.originalUrl}`, {
        headers: incoming.headers.cookie ? { cookie: incoming.headers.cookie } : {},
      }),
      new RouterContextProvider(),
    )
    outgoing.status(response.status)
    for (const [name, value] of response.headers) outgoing.append(name, value)
    if (response.body) Readable.fromWeb(response.body as never).pipe(outgoing)
    else outgoing.end()
  })
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

beforeEach(() => {
  __resetApiOutageMemory()
  api = async () => json({ data: { me: USER } })
  vi.stubGlobal('fetch', () => api())
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface Answer {
  status: number | undefined
  headers: IncomingHttpHeaders
  body: string
}

function ask(path: string, cookie?: string): Promise<Answer> {
  const { port } = server.address() as AddressInfo
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, headers: cookie ? { cookie } : {} }, incoming => {
      let body = ''
      incoming.setEncoding('utf8')
      incoming.on('data', chunk => (body += chunk))
      incoming.on('end', () =>
        resolve({ status: incoming.statusCode, headers: incoming.headers, body }),
      )
    }).on('error', reject)
  })
}

const cacheControl = async (path: string, cookie?: string) =>
  (await ask(path, cookie)).headers['cache-control']

describe('a request that carries a session cookie', () => {
  it.each([
    ['a private page', '/members', 200],
    ['a public page', '/public', 200],
    ['its client navigation', '/members.data', 200],
    ['a root revalidation', '/public.data?_routes=root', 200],
    ['a child revalidation', '/members.data?_routes=routes%2Fmembers', 200],
    ['a redirect', '/away', 302],
    ['a redirect of a client navigation', '/away.data', 202],
    ['an error', '/broken', 500],
    ['an error of a client navigation', '/broken.data', 500],
    ['a 404', '/missing', 404],
    ['a resource route without one of its own', '/resource', 200],
    ['a response with immutable headers', '/proxied', 302],
  ])('%s is private, no-store', async (_label, path, status) => {
    const answer = await ask(path, LIVE)
    expect(answer.status).toBe(status)
    expect(answer.headers['cache-control']).toBe(PRIVATE)
  })

  it('keeps the streamed body and the rest of the headers', async () => {
    const document = await ask('/members', LIVE)
    expect(document.headers['content-type']).toContain('text/html')
    expect(document.body).toContain('Members')
    const streamed = await ask('/members.data', LIVE)
    expect(streamed.headers['content-type']).toContain('text/x-script')
    expect(streamed.headers['x-remix-response']).toBe('yes')
    expect(streamed.body).toContain('user-1')
    expect((await ask('/proxied', LIVE)).headers.location).toBe('https://example.com/elsewhere')
  })

  it('whatever the verdict: rejected, unknown, expired, or one of several cookies', async () => {
    api = async () => json(UNAUTHENTICATED_RESULT)
    const rejected = await ask('/public', LIVE)
    expect(rejected.headers['cache-control']).toBe(PRIVATE)
    expect(rejected.headers['set-cookie']?.join()).toContain('__session=;')
    expect(await cacheControl('/members', LIVE)).toBe(PRIVATE)

    api = async () => Promise.reject(new TypeError('fetch failed'))
    const unknown = await ask('/members', LIVE)
    expect(unknown.status).toBe(503)
    expect(unknown.headers['cache-control']).toBe(PRIVATE)
    expect(await cacheControl('/members.data', LIVE)).toBe(PRIVATE)

    expect(await cacheControl('/public', EXPIRED)).toBe(PRIVATE)
    expect(await cacheControl('/members', EXPIRED)).toBe(PRIVATE)
    expect(await cacheControl('/public', `theme=dark; ${EXPIRED}; ${LIVE}x`)).toBe(PRIVATE)
  })

  it.each(['/shared', '/shared.data'])(
    'a shared cache cannot hold the signed-in variant of a public page (%s)',
    async path => {
      expect(await cacheControl(path, LIVE)).toBe(PRIVATE)
      expect(await cacheControl(path)).toBe('public, max-age=600')
    },
  )

  it('a stricter value, and a resource route with its own, are kept', async () => {
    expect(await cacheControl('/strict', LIVE)).toBe('no-store')
    expect(await cacheControl('/healthz', LIVE)).toBe('no-store')
    expect(await cacheControl('/resource-cached', LIVE)).toBe('public, max-age=60')
  })
})

describe('an anonymous request is unchanged', () => {
  it.each([
    ['/public', 200],
    ['/public.data', 200],
    ['/away', 302],
    ['/broken', 500],
    ['/missing', 404],
    ['/resource', 200],
    ['/members', 302],
  ])('%s has no Cache-Control', async (path, status) => {
    for (const cookie of [undefined, 'theme=dark; other__session=x; __session=']) {
      const answer = await ask(path, cookie)
      expect(answer.status).toBe(status)
      expect(answer.headers['cache-control']).toBeUndefined()
    }
  })
})
