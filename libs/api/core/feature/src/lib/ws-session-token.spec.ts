import { JwtService } from '@nestjs/jwt'
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'
import { makeServer } from 'graphql-ws'
import {
  authorizeWsConnection,
  extractTokenFromWsContext,
  WS_CLOSE_TRY_AGAIN_LATER,
  WS_CLOSE_UNAUTHORIZED,
} from './ws-session-token'

describe('extractTokenFromWsContext', () => {
  const originalSecret = process.env['JWT_SECRET']
  const originalName = process.env['VITE_COOKIE_NAME']
  const now = Math.floor(Date.now() / 1000)

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
    delete process.env['VITE_COOKIE_NAME']
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env['JWT_SECRET']
    else process.env['JWT_SECRET'] = originalSecret
    if (originalName === undefined) delete process.env['VITE_COOKIE_NAME']
    else process.env['VITE_COOKIE_NAME'] = originalName
  })

  const contextWith = (...cookieHeaders: string[]) => ({
    request: { rawHeaders: cookieHeaders.flatMap(value => ['Cookie', value]) },
  })

  it.each([
    ['first', (valid: string, forged: string) => `__session=${forged}; __session=${valid}`],
    ['last', (valid: string, forged: string) => `__session=${valid}; __session=${forged}`],
  ])('uses the valid older session over a forged newer duplicate (forged %s)', (_l, header) => {
    const valid = new JwtService({ secret: 'test-secret' }).sign({ userId: 'u1', iat: now - 3600 })
    const forged = new JwtService({ secret: 'other-secret' }).sign({
      userId: 'u2',
      iat: now + 10 * 365 * 24 * 3600,
    })

    expect(extractTokenFromWsContext(contextWith(header(valid, forged)))).toBe(valid)
  })

  it('reads a value containing = in full and finds the cookie in a later Cookie header', () => {
    expect(extractTokenFromWsContext(contextWith('theme=dark', '__session=abc=='))).toBe('abc==')
  })

  it('returns an empty string when there is no session cookie or no request', () => {
    expect(extractTokenFromWsContext(contextWith('theme=dark'))).toBe('')
    expect(extractTokenFromWsContext({})).toBe('')
    expect(extractTokenFromWsContext(undefined)).toBe('')
  })
})

/**
 * Through graphql-ws's own server: the close code a client sees for `connection_init`. The first
 * close wins (graphql-ws's later 4403 for `false` lands on a socket that is already closing).
 */
describe('authorizeWsConnection', () => {
  const originalSecret = process.env['JWT_SECRET']
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'Query', fields: { ok: { type: GraphQLString } } }),
  })

  beforeEach(() => {
    process.env['JWT_SECRET'] = 'test-secret'
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env['JWT_SECRET']
    else process.env['JWT_SECRET'] = originalSecret
  })

  async function closeCodeFor(cookie: string | undefined): Promise<number | undefined> {
    const closes: number[] = []
    let onMessage: (data: string) => Promise<void> = async () => undefined
    const socket = {
      protocol: 'graphql-transport-ws',
      send: async () => undefined,
      close: (code: number) => {
        closes.push(code)
      },
      onMessage: (cb: (data: string) => Promise<void>) => {
        onMessage = cb
      },
    }
    const extra = {
      socket,
      request: { rawHeaders: cookie === undefined ? [] : ['Cookie', cookie] },
    }
    const server = makeServer({ schema, onConnect: ctx => authorizeWsConnection(ctx.extra) })
    server.opened(socket, extra)
    await onMessage(JSON.stringify({ type: 'connection_init' }))
    return closes[0]
  }

  it('admits a connection with a session that verifies', async () => {
    const session = new JwtService({ secret: 'test-secret' }).sign({ userId: 'u1' })

    await expect(closeCodeFor(`__session=${session}`)).resolves.toBeUndefined()
  })

  it('closes with 4401 Unauthorized when there is no session', async () => {
    await expect(closeCodeFor(undefined)).resolves.toBe(WS_CLOSE_UNAUTHORIZED)
  })

  it('closes with 4401 Unauthorized when the session does not verify', async () => {
    const forged = new JwtService({ secret: 'other-secret' }).sign({ userId: 'u1' })

    await expect(closeCodeFor(`__session=${forged}`)).resolves.toBe(WS_CLOSE_UNAUTHORIZED)
  })

  // Not the client's session: the server cannot check any. 1013 is retried by graphql-ws clients;
  // 4500 (what a thrown error became) and 4401 are not.
  it('closes with 1013 Try Again Later when the server cannot check the session', async () => {
    delete process.env['JWT_SECRET']

    await expect(closeCodeFor('__session=anything')).resolves.toBe(WS_CLOSE_TRY_AGAIN_LATER)
  })

  // An unexpected verifier failure is the server's, not the session's: 1013, not the fatal 4401.
  // Also through duplicate-cookie selection, which verifies each candidate.
  it.each([
    ['one cookie', (token: string) => `__session=${token}`],
    ['duplicate cookies', (token: string) => `__session=${token}; __session=${token}x`],
  ])('closes with 1013 when the verifier throws a plain Error (%s)', async (_label, header) => {
    const session = new JwtService({ secret: 'test-secret' }).sign({ userId: 'u1' })
    const verify = jest.spyOn(JwtService.prototype, 'verify').mockImplementation(() => {
      throw new Error('crypto backend unavailable')
    })
    try {
      await expect(closeCodeFor(header(session))).resolves.toBe(WS_CLOSE_TRY_AGAIN_LATER)
    } finally {
      verify.mockRestore()
    }
  })

  it('refuses without a socket to close (another transport)', () => {
    expect(authorizeWsConnection({ request: { rawHeaders: [] } })).toBe(false)
  })
})
