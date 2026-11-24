// @vitest-environment node
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gql } from '@apollo/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeClient } from '@nestled-template/shared/apollo'

// The server-side client over a real HTTP connection, with Node's own fetch: what the API receives
// when the browser's request holds one session cookie, or several. (The API's side, over its real
// JwtStrategy and guard: libs/api/custom, jwt.strategy.guard.spec.ts.)

let server: Server
let received: IncomingHttpHeaders[]

beforeEach(async () => {
  received = []
  server = createServer((incoming, response) => {
    received.push(incoming.headers)
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: { ping: 'pong' } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
})

afterEach(async () => {
  await new Promise(resolve => server.close(resolve))
})

async function headersFor(cookie: string): Promise<IncomingHttpHeaders> {
  const { port } = server.address() as AddressInfo
  const client = makeClient(new Request('http://app.example.com/', { headers: { cookie } }), {
    apiUrl: `http://127.0.0.1:${port}/graphql`,
  })
  await client.query({
    query: gql`
      query Ping {
        ping
      }
    `,
  })
  expect(received).toHaveLength(1)
  return received[0]
}

describe('what the API receives from a server-side client', () => {
  it('several session cookies: all of them, nothing else of the Cookie header, no bearer', async () => {
    const headers = await headersFor('theme=dark; __session=a.b.c; other=1; __session=d.e.f')
    expect(headers.cookie).toBe('__session=a.b.c; __session=d.e.f')
    expect(headers.authorization).toBeUndefined()
    // What the API's CSRF check asks of a request, the same either way.
    expect(headers['apollo-require-preflight']).toBe('true')
    expect(headers.origin).toBeUndefined()
  })

  it('one session cookie: a bearer token, no Cookie header', async () => {
    const headers = await headersFor('theme=dark; __session=a.b.c')
    expect(headers.authorization).toBe('Bearer a.b.c')
    expect(headers.cookie).toBeUndefined()
    expect(headers['apollo-require-preflight']).toBe('true')
  })
})
