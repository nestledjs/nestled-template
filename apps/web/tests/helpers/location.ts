import { vi } from 'vitest'

/**
 * Replaces `location` so a spec can see a document load, which jsdom cannot do. Undone by
 * `vi.unstubAllGlobals()`.
 */
export function stubLocation() {
  const location = {
    ...globalThis.location,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  }
  vi.stubGlobal('location', location)
  return location
}
