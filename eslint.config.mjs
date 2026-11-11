import nx from '@nx/eslint-plugin'
import { createRequire } from 'node:module'

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/build',
      '**/.react-router',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allowCircularSelfDependency: true,
          allow: [String.raw`^.*/eslint(\.base)?\.config\.[cm]?[jt]s$`],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['libs/api/**/*.ts', 'apps/api/src/**/*.ts'],
    ignores: ['libs/api/generated-crud/**/*.ts', 'apps/api/src/app.module.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/generated-crud/**'],
              message:
                'Handwritten APIs must never compose generated CRUD. Define an explicit input and Prisma query instead.',
            },
            {
              group: ['**/api/core/helpers', '**/api/core/helpers/**'],
              message:
                'The legacy recursive selection compiler was removed. Build an explicit Prisma select instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['apps/web/tests/**/*.spec.ts', 'apps/web/tests/**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
]

// eslint-plugin-react (through `nx.configs['flat/react']`) sets `react.version: 'detect'`, and its
// detection calls `context.getFilename()`, which ESLint 10 removed: every React lint crashes with
// "contextOrFilename.getFilename is not a function". Naming the installed version skips detection.
// Spread this after `nx.configs['flat/react']`. Remove it once eslint-plugin-react supports ESLint 10.
export const reactVersionSettings = {
  settings: { react: { version: createRequire(import.meta.url)('react/package.json').version } },
}

// eslint-plugin-react-hooks v7's `recommended` set (through `nx.configs['flat/react']`) leaves
// `incompatible-library` and `unsupported-syntax` at warn. Every react-hooks v7 rule is an error in
// this workspace (`exhaustive-deps` stays a warning), so this raises those two. Spread it after
// `reactVersionSettings` in every React lint config. The files match the ones the plugin is
// registered for in `flat/react`.
export const reactHooksRuleLevels = {
  files: [
    '**/*.ts',
    '**/*.cts',
    '**/*.mts',
    '**/*.tsx',
    '**/*.js',
    '**/*.cjs',
    '**/*.mjs',
    '**/*.jsx',
  ],
  rules: {
    'react-hooks/incompatible-library': 'error',
    'react-hooks/unsupported-syntax': 'error',
  },
}
