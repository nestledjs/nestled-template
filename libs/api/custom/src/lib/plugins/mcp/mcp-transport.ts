import type { Request, Response } from 'express'
import { isJSONRPCRequest, type JSONRPCMessage, type Transport } from '@modelcontextprotocol/server'

const RESPONSE_TIMEOUT_MS = 30_000
const BODY_FRAMING_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection'])

interface UnrefableTimer {
  unref: () => void
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer !== 'object' || timer === null || !('unref' in timer)) return

  const maybeUnref = (timer as { unref?: unknown }).unref
  if (typeof maybeUnref === 'function') {
    ;(timer as UnrefableTimer).unref()
  }
}

/**
 * Serves one 2025-era JSON-RPC POST (an `initialize`, a `tools/list`, a `tools/call`, a batch, …)
 * on a server built for that request alone, and answers with a plain JSON body.
 *
 * This is the endpoint's pre-2026 behaviour, kept byte for byte for the clients that already use
 * it: no `Mcp-Session-Id`, no SSE, no `Accept: text/event-stream` requirement, JSON-RPC batches
 * accepted. It exists because CDNs in front of the API (e.g. Railway/Fastly) kill long-lived
 * connections, and it is why the SDK's stateless legacy fallback (which answers over SSE and
 * refuses a JSON-only `Accept`) is not used for these clients.
 */
export class JsonRequestTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  private readonly pending = new Map<string | number, (msg: JSONRPCMessage) => void>()

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async start(): Promise<void> {}

  send(message: JSONRPCMessage): Promise<void> {
    if ('id' in message && message.id !== null && message.id !== undefined) {
      const resolve = this.pending.get(message.id)
      if (resolve) {
        resolve(message)
        this.pending.delete(message.id)
      }
    }
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.onclose?.()
    return Promise.resolve()
  }

  async handleBody(body: unknown): Promise<JSONRPCMessage | JSONRPCMessage[] | null> {
    if (!body || typeof body !== 'object') throw new Error('Invalid request body')

    const messages: JSONRPCMessage[] = Array.isArray(body)
      ? (body as JSONRPCMessage[])
      : [body as JSONRPCMessage]

    const requestMessages = messages.filter(m => isJSONRPCRequest(m))

    const responsePromises = requestMessages.map(
      req =>
        new Promise<JSONRPCMessage>(resolve => {
          this.pending.set(req.id, resolve)
        }),
    )

    for (const msg of messages) {
      this.onmessage?.(msg)
    }

    if (responsePromises.length === 0) return null

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('MCP response timeout')),
          RESPONSE_TIMEOUT_MS,
        )
        unrefTimer(timeoutHandle)
      })
      const responses = await Promise.race([Promise.all(responsePromises), timeout])
      const [firstResponse] = responses

      return responses.length === 1 ? firstResponse : responses
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }
}

/**
 * The web-standard `Request` the v2 SDK entry points take, rebuilt from an Express request whose
 * JSON body has already been parsed by the API's body parser.
 */
export function toWebRequest(req: Request, origin: string): globalThis.Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    // The body is re-serialised, so the original framing headers no longer describe it.
    if (value === undefined || BODY_FRAMING_HEADERS.has(name.toLowerCase())) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
  }
  return new globalThis.Request(`${origin}${req.originalUrl ?? req.url ?? ''}`, {
    method: req.method,
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  })
}

/**
 * Writes a web-standard `Response` to Express. The modern handler is configured to answer every
 * request with a single, finite body (`responseMode: 'json'`, no listen streams), so the body is
 * read whole rather than streamed.
 */
export async function sendWebResponse(webResponse: globalThis.Response, res: Response) {
  res.status(webResponse.status)
  webResponse.headers.forEach((value, name) => {
    res.header(name, value)
  })
  const body = await webResponse.text()
  res.send(body)
}
