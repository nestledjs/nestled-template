import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/web-ui',

  plugins: [react()],

  define: {
    'import.meta.vitest': 'undefined',
  },

  test: {
    name: 'web-ui', // Required for multi-project Nx/Vitest setups
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./setupTests.ts'],
    testTimeout: 10000,
    watch: false,

    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/libs/web-ui',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.stories.{ts,tsx}', '**/*.d.ts', '**/index.ts', '**/types.ts'],
    },

    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },

  optimizeDeps: {
    include: [],
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react'],
    alias: {
      // Optional custom aliases (Nx paths are resolved by resolve.tsconfigPaths)
    },
  },

  build: {
    sourcemap: true,
  },
})
