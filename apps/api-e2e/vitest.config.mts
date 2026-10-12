import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@nestled-template/api/prisma': resolve(__dirname, '../../libs/api/prisma/src/index.ts'),
      '@nestled-template/api/core/data-access': resolve(
        __dirname,
        '../../libs/api/core/data-access/src/index.ts',
      ),
      '@nestled-template/api/utils': resolve(__dirname, '../../libs/api/utils/src/index.ts'),
      '@nestled-template/api/custom': resolve(__dirname, '../../libs/api/custom/src/index.ts'),
    },
  },
  test: {
    name: 'api-e2e',
    root: resolve(__dirname),
    environment: 'node',
    globalSetup: resolve(__dirname, './src/support/global-setup.ts'),
    setupFiles: [resolve(__dirname, './src/support/test-setup.ts')],
    include: [resolve(__dirname, './src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}')],
    // The test-support dependency runs these without starting databases or an API.
    exclude: [
      '**/support/api-process.spec.ts',
      '**/support/api-process.native.spec.ts',
      '**/support/e2e-runner.spec.ts',
      '**/support/sql-runner.spec.ts',
    ],
    // Name every test and its result. Under Nx and in CI the output is not a TTY, and the default
    // reporter then prints only the summary, so a log could not show which tests ran.
    reporters: ['verbose'],
    // A run that matches no test file is a failure, not a pass.
    passWithNoTests: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    sequence: {
      shuffle: false, // Don't shuffle tests - run alphabetically
    },
    pool: 'forks', // Use forks instead of threads for better isolation and cleanup
    maxWorkers: 1, // Run in single fork for sequential test execution
    isolate: false, // Spec files share one module context in that fork
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/api-e2e',
      reporter: ['text', 'json', 'html', 'lcov'],
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
        '**/.{eslint,mocha,prettier}rc.{js,cjs,yml}',
      ],
    },
  },
})
