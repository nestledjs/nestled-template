export default {
  displayName: 'api-custom',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/api/custom',
  coverageReporters: ['html', 'lcov', 'text-summary'],
  /**
   * Measure every source file, not only the ones a spec happened to import.
   *
   * Without this, Jest reports on the files reachable from a test and omits the rest entirely, so
   * a file with no test at all does not lower the percentage — it is simply absent. The threshold
   * below is then computed over a subset that changes as tests are added or deleted, which is how
   * a coverage gate ends up rising when you delete a test.
   *
   * Concretely, in this library it was the difference between 86.9% over 71 of 132 source files
   * and 70.7% over all of them. The first number is not wrong; it just is not what it appears to
   * be, and it is not something a threshold can be honestly set against.
   *
   * Barrels and declaration files are excluded because they contain no executable branch.
   * Nothing else is: excluding modules and DTOs moves statements only 70.7% -> 75.3%, which buys
   * a better-looking number by measuring less, and that is the failure this setting exists to fix.
   *
   * Both test suffixes are excluded. The preset's testMatch is `+(spec|test)`, so a `.test.ts`
   * file is run as a test; counting it as source would add a file that executes end to end and
   * therefore reports near-total coverage, inflating the denominator's health rather than
   * measuring it. There are none today, which is exactly when the exclusion is cheap to add.
   */
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/index.ts',
    '!src/**/*.d.ts',
  ],
  /**
   * A ratchet, not an aspiration.
   *
   * These are set just below what this library actually measures today (70.73 statements, 73.56
   * branches, 56.15 functions, 71.73 lines) so the gate prevents regression rather than failing on
   * arrival. A threshold above current coverage is not a policy — it is a red build, and a build
   * that is red on arrival gets disabled, after which there is no gate at all.
   *
   * Raise these deliberately when coverage work lands. Do not raise them speculatively.
   *
   * Forward pressure belongs in the Sonar new-code gate instead: strict on the lines being changed
   * now, with no penalty for legacy surface nobody has reached yet. That is the right tool for
   * "get better over time"; this one is the right tool for "do not get worse".
   *
   * Functions sits lowest because it is the honest reading and the most diagnostic of the four —
   * it is the metric that reveals whole code paths nothing ever calls.
   */
  coverageThreshold: {
    global: {
      statements: 68,
      branches: 70,
      functions: 55,
      lines: 68,
    },
    /**
     * Strict where the risk concentrates. These tools are agent-reachable data access, and the
     * audit that produced this threshold found four real tenancy defects in them, so a new path
     * arriving untested here is not an oversight — it is an unreviewed authorization boundary.
     */
    'libs/api/custom/src/lib/plugins/mcp/tools/*.ts': {
      statements: 100,
      branches: 80,
      functions: 100,
      lines: 100,
    },
  },
}
