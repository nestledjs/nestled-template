// @vitest-environment node
import {
  createRequestHandler,
  type LoaderFunctionArgs,
  UNSAFE_withComponentProps as withComponentProps,
  UNSAFE_withErrorBoundaryProps as withErrorBoundaryProps,
  type ServerBuild,
} from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as entryServer from '../app/entry.server'
import * as rootModule from '../app/root'
import * as healthzModule from '../app/routes/healthz'
import routes from '../app/routes'

// `GET /healthz` served through React Router's own request handler, the real entry.server.tsx and
// the real root route, with a signed-in session cookie and every outgoing `fetch` (the API) failing
// the test if it is called.

function routeEntry(id: string, path: string, parentId?: string, hasLoader = false) {
  return {
    id,
    path,
    parentId,
    hasAction: false,
    hasLoader,
    hasClientAction: false,
    hasClientLoader: false,
    hasClientMiddleware: false,
    hasErrorBoundary: id === 'root',
    module: `/${id}.js`,
    imports: [],
    css: [],
    clientActionModule: undefined,
    clientLoaderModule: undefined,
    clientMiddlewareModule: undefined,
    hydrateFallbackModule: undefined,
  }
}

const fetchMock = vi.fn()
const rootLoader = vi.fn((args: LoaderFunctionArgs) =>
  (rootModule.loader as (args: LoaderFunctionArgs) => unknown)(args),
)

function build(): ServerBuild {
  return {
    entry: { module: entryServer },
    routes: {
      root: {
        id: 'root',
        path: '',
        module: {
          ...rootModule,
          loader: rootLoader,
          default: withComponentProps(rootModule.default),
          ErrorBoundary: withErrorBoundaryProps(rootModule.ErrorBoundary),
        },
      },
      'routes/healthz': {
        id: 'routes/healthz',
        parentId: 'root',
        path: 'healthz',
        module: healthzModule,
      },
    },
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: {
        root: routeEntry('root', '', undefined, true),
        'routes/healthz': routeEntry('routes/healthz', 'healthz', 'root', true),
      },
      url: '/manifest.js',
      version: 'test',
    },
    publicPath: '/',
    assetsBuildDirectory: 'build/client',
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: 'initial', manifestPath: '/__manifest' },
  } as unknown as ServerBuild
}

function request() {
  const handler = createRequestHandler(build(), 'production')
  return handler(
    new Request('http://localhost/healthz', {
      headers: { cookie: '__session=header.e30.signature; theme=dark' },
    }),
  )
}

describe('GET /healthz', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    rootLoader.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers 200 ok as uncached plain text', async () => {
    const response = await request()

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('calls no API and runs no layout loader, even with a session cookie', async () => {
    await request()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(rootLoader).not.toHaveBeenCalled()
  })

  it('stays 200 while the API is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const response = await request()

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('is registered outside every layout, so no signed-in or public layout loader runs', () => {
    const entry = routes.find(route => route.path === 'healthz')

    expect(entry?.file).toBe('./routes/healthz.ts')
    expect(entry?.children ?? []).toHaveLength(0)
    expect('default' in healthzModule).toBe(false)
  })
})
