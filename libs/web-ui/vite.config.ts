import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/web-ui',

  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

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
      all: true,
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
    dedupe: ['react'],
    alias: {
      // Optional custom aliases (Nx paths are already handled by nxViteTsPaths)
    },
  },

  build: {
    sourcemap: true,
  },
})
