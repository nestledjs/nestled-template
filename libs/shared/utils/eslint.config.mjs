import nx from '@nx/eslint-plugin'
import baseConfig, { reactVersionSettings } from '../../../eslint.config.mjs'

export default [
  ...baseConfig,
  ...nx.configs['flat/react'],
  reactVersionSettings,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
]
