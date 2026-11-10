import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/web',
  plugins: [react()],
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/web',
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        '**/*.spec.{ts,tsx}',
        '**/*.test.{ts,tsx}',
        '**/index.ts',
        // Test scaffolding, not product code: it would count as uncovered source.
        'src/__mocks__/**',
        'src/test-setup.ts',
      ],
    },
  },
})
