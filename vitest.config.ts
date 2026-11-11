import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/api-e2e/vitest.config.mts',
      'apps/web/vite.config.ts',
      'libs/web-ui/vite.config.mts',
      'libs/shared/apollo/vite.config.ts',
      'libs/shared/sdk/vite.config.ts',
      '!vitest.config.ts',
    ],
  },
})
