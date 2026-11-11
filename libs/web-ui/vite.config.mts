// An ES module config (.mts), not vite.config.ts: libs/web-ui has no package.json of its own, so
// a .ts config here is CommonJS to Node, and Nx's project-graph build `require()`s it. Its
// @vitejs/plugin-react import is ESM-only, so that require raced the `import()` another config
// made of the same module and failed at random in CI ("not yet fully loaded"). A .mts file is
// always loaded as ESM. Keep any config that loads an ESM-only plugin from a CommonJS context as
// .mts.
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
