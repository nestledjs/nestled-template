import { defineConfig, mergeConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import viteConfig from './vite.config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Handle __dirname in ESM
const dirname =
  typeof __dirname === 'undefined' ? path.dirname(fileURLToPath(import.meta.url)) : __dirname

export default defineConfig(async () => {
  const baseConfig = await viteConfig

  return mergeConfig(
    baseConfig,
    defineConfig({
      test: {
        // Vitest project mode
        projects: [
          // ✅ Regular unit/component tests
          {
            ...baseConfig,
            test: {
              ...baseConfig.test,
              name: 'unit',
            },
          },

          // ✅ Storybook interaction tests
          {
            ...baseConfig,
            plugins: [
              ...(baseConfig.plugins ?? []),
              storybookTest({
                configDir: path.join(dirname, '.storybook'),
                // NX_DAEMON=false avoids the Nx daemon inside the Storybook browser-test
                // spawn (flaky/hangs in CI); STORYBOOK_DISABLE_TELEMETRY silences the
                // telemetry network call that otherwise fires on every run.
                storybookScript:
                  'NX_DAEMON=false STORYBOOK_DISABLE_TELEMETRY=1 nx run web-ui:storybook --ci',
              }),
            ],
            test: {
              ...baseConfig.test,
              name: 'storybook',
              setupFiles: ['./.storybook/vitest.setup.ts'],
              browser: {
                enabled: true,
                provider: playwright(),
                headless: true,
                instances: [{ browser: 'chromium' }],
              },
            },
          },
        ],
      },
    }),
  )
})
