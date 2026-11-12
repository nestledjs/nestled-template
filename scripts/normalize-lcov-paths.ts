import { normalizeLcovReports } from './normalize-lcov-paths.lib'

// `pnpm coverage:normalize-lcov`: makes every coverage/**/lcov.info's `SF:` paths repo-relative
// for SonarCloud. The rewrite lives in normalize-lcov-paths.lib.ts, which the spec imports; this
// file only runs it. Neither uses `import.meta`, so both typecheck whether a project checks
// scripts/ as ES modules or as CommonJS (where `import.meta` is TS1343).
for (const path of normalizeLcovReports(process.cwd())) console.log(`normalized ${path}`)
