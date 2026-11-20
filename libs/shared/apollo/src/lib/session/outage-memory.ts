// Server only, process-wide: when this web instance last saw the API unreachable. Every server-side
// Apollo client (makeClient with no window) records here through its error link, whichever request
// it served, so a 401 that arrives just after another request found the API down is not trusted
// (`judgeSession`, OUTAGE_MEMORY_MS). Per instance: with several web replicas, each keeps its own,
// which is acceptable because it only adds to the confirmation call's guard.

// Registered on globalThis under a `Symbol.for` key so a second copy of this module (a separate
// server chunk) shares the same memory.
const MEMORY_KEY = Symbol.for('nestled.apiOutageSeenAt')
const memory = globalThis as { [MEMORY_KEY]?: number }

/** Records that the API was just found unreachable (no answer, 502/503/504, GraphQL 503). */
export function recordApiOutage(now: number = Date.now()): void {
  memory[MEMORY_KEY] = now
}

/** How long ago this instance last saw the API unreachable, or undefined if it never has. */
export function apiOutageSeenMsAgo(now: number = Date.now()): number | undefined {
  const seenAt = memory[MEMORY_KEY]
  return seenAt === undefined ? undefined : Math.max(0, now - seenAt)
}

/** For specs: forget every recorded outage. */
export function __resetApiOutageMemory(): void {
  delete memory[MEMORY_KEY]
}
