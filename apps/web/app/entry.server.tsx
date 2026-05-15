/**
 * By default, React Router will handle generating the HTTP Response for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://reactrouter.com/explanation/special-files#entryservertsx
 */

import { PassThrough } from 'node:stream'

import type { AppLoadContext, EntryContext } from 'react-router'
import { ServerRouter } from 'react-router'
import { createReadableStreamFromReadable } from '@react-router/node'
import { isbot } from 'isbot'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import { renderToPipeableStream } from 'react-dom/server'
import { makeClient } from '@nestled-template/shared/apollo'
import { ApolloProvider } from '@apollo/client/react'
import { disableFragmentWarnings } from 'graphql-tag'

disableFragmentWarnings()

export const streamTimeout = 5_000

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  const userAgent = request.headers.get('user-agent')

  // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
  // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
  const readyOption: keyof RenderToPipeableStreamOptions =
    (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

  const client = makeClient(request, {
    apiUrl: `${process.env.VITE_API_URL || 'http://localhost:3000'}/graphql`
  })

  return new Promise((resolve, reject) => {
    let shellRendered = false

    const { pipe, abort } = renderToPipeableStream(
      <ApolloProvider client={client}>
        <ServerRouter context={routerContext} url={request.url} />
      </ApolloProvider>,
      {
        [readyOption]() {
          shellRendered = true
          const body = new PassThrough()
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set('Content-Type', 'text/html')

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )

          pipe(body)
        },
        onShellError(error: unknown) {
          console.error('[SSR] Shell render error:', error)
          const msg = (error as Error)?.message ?? ''
          // Apollo streaming signals auth/network failure via this redacted error.
          // Redirect to force-logout to clear the stale cookie instead of serving 500.
          if (msg.includes('event stream') || msg.includes('Redacted for security concerns')) {
            console.error('[SSR] Apollo event stream error detected — redirecting to force-logout')
            const cookieName = process.env.VITE_COOKIE_NAME || '__session'
            const cookieDomain = process.env.VITE_COOKIE_DOMAIN
            const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
            const base = `${cookieName}=; Path=/; ${expired}; HttpOnly; SameSite=Lax`
            const url = new URL(request.url)
            const returnParam = url.pathname !== '/' ? `?return_url=${encodeURIComponent(url.pathname)}` : ''
            const headers = new Headers({ Location: `/force-logout${returnParam}` })
            headers.append('Set-Cookie', cookieDomain && cookieDomain !== 'localhost'
              ? `${base}; Domain=${cookieDomain}`
              : base)
            resolve(new Response(null, { status: 302, headers }))
          } else {
            reject(error)
          }
        },
        onError(error: unknown) {
          responseStatusCode = 500
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error)
          }
        },
      },
    )

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    setTimeout(abort, streamTimeout + 1000)
  })
}
