import nx from '@nx/eslint-plugin'
import baseConfig, { reactHooksRuleLevels, reactVersionSettings } from '../../eslint.config.mjs'

export default [
  ...baseConfig,
  ...nx.configs['flat/react'],
  reactVersionSettings,
  reactHooksRuleLevels,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
]
