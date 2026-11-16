import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { vi } from 'vitest'
import './mocks/sdk'

// Unmount before any global is unstubbed. A spec's own `afterEach(() => vi.unstubAllGlobals())`
// runs before Testing Library's automatic cleanup (Vitest runs afterEach hooks in reverse order of
// registration, and the import registers cleanup first). Unmounting then flushes passive effects
// against the real globals, and one that uses a stubbed browser API (IntersectionObserver, fetch,
// location) fails with "... is not defined" or reaches the network, depending on test order.
// Unmounting first here makes every spec's teardown safe without its own `cleanup()` call.
// cleanup() is idempotent, so Testing Library's later call finds nothing left to unmount.
const unstubAllGlobals = vi.unstubAllGlobals.bind(vi)
vi.unstubAllGlobals = () => {
  cleanup()
  return unstubAllGlobals()
}

// jsdom lacks ResizeObserver, which Headless UI's floating components
// (Combobox/Listbox/Menu panels) reference when they open. Provide a no-op
// stub so those components can be tested.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {
      /* no-op */
    }
    unobserve() {
      /* no-op */
    }
    disconnect() {
      /* no-op */
    }
  }
}
