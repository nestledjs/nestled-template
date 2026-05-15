import { defineConfig, mergeConfig } from 'vitest/config'
//@ts-ignore
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
//@ts-ignore
import { playwright } from '@vitest/browser-playwright'
import viteConfig from './vite.config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Handle __dirname in ESM
const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Vitest project mode
      projects: [
        // ✅ Regular unit/component tests
        {
          ...viteConfig,
          test: {
            ...viteConfig.test,
            name: 'unit',
          },
        },

        // ✅ Storybook interaction tests
        {
          ...viteConfig,
          plugins: [
            ...(viteConfig.plugins ?? []),
            storybookTest({
              configDir: path.join(dirname, '.storybook'),
              storybookScript: 'nx run web-ui:storybook --ci',
            }),
          ],
          test: {
            ...viteConfig.test,
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
