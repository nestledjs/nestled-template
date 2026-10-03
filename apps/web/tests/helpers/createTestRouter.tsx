import { createRoutesStub } from 'react-router'
import type { RouteObject } from 'react-router'

/**
 * Creates a router stub for testing - just a thin wrapper around createRoutesStub.
 * This provides a consistent API and makes it easy to add test-specific configuration later.
 *
 * Note: The "No HydrateFallback element provided" warning is harmless in tests and can be ignored.
 * Adding HydrateFallback would require providing hydrationData which complicates tests unnecessarily.
 *
 * @param routes - Array of route objects to stub
 * @returns A RouterStub component ready for testing
 */
export function createTestRouter(routes: RouteObject[]) {
  // Just pass through to createRoutesStub
  // The hydration warning is expected and harmless in test environment
  return createRoutesStub(routes)
}
