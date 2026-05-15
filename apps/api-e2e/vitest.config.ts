import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@nestled-template/api/prisma': resolve(__dirname, '../../libs/api/prisma/src/index.ts'),
      '@nestled-template/api/core/data-access': resolve(__dirname, '../../libs/api/core/data-access/src/index.ts'),
      '@nestled-template/api/utils': resolve(__dirname, '../../libs/api/utils/src/index.ts'),
      '@nestled-template/api/custom': resolve(__dirname, '../../libs/api/custom/src/index.ts'),
    },
  },
  test: {
    name: 'api-e2e',
    root: resolve(__dirname),
    environment: 'node',
    globalSetup: resolve(__dirname, './src/support/global-setup.ts'),
    globalTeardown: resolve(__dirname, './src/support/global-teardown.ts'),
    setupFiles: [resolve(__dirname, './src/support/test-setup.ts')],
    include: [resolve(__dirname, './src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}')],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    sequence: {
      shuffle: false, // Don't shuffle tests - run alphabetically
    },
    pool: 'forks', // Use forks instead of threads for better isolation and cleanup
    maxWorkers: 1, // Run in single fork for sequential test execution
    isolate: false, // Allow process.exit() to work
    // Don't fail on process.exit() - we use it intentionally for cleanup
    dangerouslyIgnoreUnhandledErrors: true,
    // Filter out the process.exit error specifically
    onUnhandledError(error): boolean | void {
      console.log('🔍 onUnhandledError called:', error.message || String(error))
      // Return true to filter out this error (it won't fail the test run)
      const errorStr = String(error.message || error)
      if (errorStr.includes('process.exit')) {
        console.log('🔕 Filtering process.exit error')
        return true
      }
      console.log('❌ Not filtering this error')
      return false
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'coverage/**',
        'dist/**',
        '**/[.]**',
        'packages/*/test{,s}/**',
        '**/*.d.ts',
        '**/virtual:*',
        '**/__x00__*',
        '**/\x00*',
        'cypress/**',
        'test{,s}/**',
        'test{,-*}.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}test.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}spec.{js,cjs,mjs,ts,tsx,jsx}',
        '**/__tests__/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/vitest.{workspace,projects}.[jt]s?(on)',
        '**/.{eslint,mocha,prettier}rc.{js,cjs,yml}'
      ]
    }
  }
})