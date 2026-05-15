export default {
  displayName: 'api-e2e-simple',
  preset: '../../jest.preset.js',
  // No global setup/teardown for simple tests
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        useESM: true
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@faker-js/faker)/)'
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/api-e2e-simple',
  testMatch: ['<rootDir>/src/basic-validation.spec.ts'],
}