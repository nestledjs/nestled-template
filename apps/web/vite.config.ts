/// <reference types='vitest' />
import mdx from '@mdx-js/rollup'
import { defineConfig } from 'vite'
import { reactRouter } from '@react-router/dev/vite'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  assetsInclude: ['**/*.node'],
  define: {
    // Ensure API URL is available in client bundle
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || 'http://localhost:3000',
    ),
    'process.env.VITE_COOKIE_NAME': JSON.stringify(process.env.VITE_COOKIE_NAME || '__session'),
  },
  resolve: {
    alias: {
      // Ensure React Router generated types are properly resolved
      '~': path.resolve(__dirname, './app'),
    },
  },
  // Dev/preview ports come from the repo-root `.env` so several nestled apps can run side by side
  // (see the port block in `.env.example`). Nx loads that file into the task env, so `pnpm dev:web`
  // (= `nx serve web`) sees these; a bare `npx vite` from this directory does not.
  // `Number(undefined)` is NaN and `Number('')` is 0 — both falsy, so unset or empty keeps the
  // current default.
  server: {
    port: Number(process.env.WEB_PORT) || 4200,
    host: process.env.VITE_HOST || 'localhost',
    fs: {
      allow: [path.resolve(__dirname, '../../libs'), path.resolve(__dirname, './.react-router')],
    },
  },
  preview: {
    port: Number(process.env.WEB_PREVIEW_PORT) || 4300,
    host: process.env.VITE_HOST || 'localhost',
  },
  plugins: [
    mdx({
      include: [/\.mdx?$/], // Handle both .md and .mdx files
      remarkPlugins: [remarkFrontmatter, [remarkMdxFrontmatter, { name: 'attributes' }]],
    }),
    !process.env.VITEST && reactRouter(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: ['@apollo/client', '@apollo/client/react'],
  },
  ssr: {
    noExternal: ['@nestledjs/forms', /^@apollo\/client/],
    // Keep data-browser external
    external: ['@nestledjs/data-browser'],
  },
  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: id => {
        // Exclude problematic Node.js build tools and Nx generators from bundling
        if (id.includes('@nx/nest') || id.includes('@nx/js') || id.includes('@swc-node/register')) {
          return true
        }
        // Don't bundle Node.js specific modules
        if (
          id.includes('node_modules/@nx/') &&
          (id.includes('/generators/') || id.includes('/executors/'))
        ) {
          return true
        }
        return false
      },
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'html', 'lcov'],
    },
  },
}))
