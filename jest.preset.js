const path = require('node:path')
const nxPreset = require('@nx/jest/preset').default

// Workspace root for absolute paths
const workspaceRoot = __dirname

module.exports = {
  ...nxPreset,
  // Mock ESM modules that Jest can't handle
  moduleNameMapper: {
    ...nxPreset.moduleNameMapper,
    // Mock prisma-graphql-type-decimal since it's ESM-only and causes issues with Jest
    '^prisma-graphql-type-decimal$': path.join(
      workspaceRoot,
      'jest-mocks/prisma-graphql-type-decimal.js',
    ),
    // Mock uuid since v14+ is ESM-only
    '^uuid$': path.join(workspaceRoot, 'jest-mocks/uuid.js'),
  },
}
