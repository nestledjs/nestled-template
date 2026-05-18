export default [
  // Include API E2E tests
  'apps/api-e2e/vitest.config.ts',
  // Include other Vite projects (but exclude the conflicting web-ui vitest.config.ts)
  'apps/web/vite.config.ts',
  'libs/web-ui/vite.config.ts', // Keep the main vite config but not vitest
  'libs/shared/apollo/vite.config.ts',
  'libs/shared/sdk/vite.config.ts',
]
