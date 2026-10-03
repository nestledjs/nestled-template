import { vi } from 'vitest'

// Global mock for @nestled-template/shared/sdk
// This preserves all real exports while allowing individual tests to override specific ones
vi.mock('@nestled-template/shared/sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@nestled-template/shared/sdk')>()
  return {
    ...actual,
    // Tests can still override specific exports by calling vi.mock again in their test files
  }
})
