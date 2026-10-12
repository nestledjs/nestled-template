import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    name: 'api-e2e-support',
    root: resolve(__dirname),
    environment: 'node',
    include: [
      'src/support/api-process.spec.ts',
      'src/support/api-process.native.spec.ts',
      'src/support/e2e-runner.spec.ts',
      'src/support/sql-runner.spec.ts',
    ],
    passWithNoTests: false,
  },
})
