// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook'

import { fileURLToPath } from 'node:url'
import nx from '@nx/eslint-plugin'
import baseConfig from '../../eslint.config.mjs'

export default [
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  ...storybook.configs['flat/recommended'],
  {
    // Storybook addons are installed by the workspace manifest; this library has no package.json.
    files: ['.storybook/main.@(js|cjs|mjs|ts)'],
    rules: {
      'storybook/no-uninstalled-addons': [
        'error',
        { packageJsonLocation: fileURLToPath(new URL('../../package.json', import.meta.url)) },
      ],
    },
  },
]
