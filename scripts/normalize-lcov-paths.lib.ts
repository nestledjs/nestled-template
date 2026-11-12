import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'

// The rewrite behind `pnpm coverage:normalize-lcov` (normalize-lcov-paths.ts runs it; the spec
// imports this file). No `import.meta` here or in the runner: a project that typechecks scripts/ as
// CommonJS reports it as TS1343.
//
// Rewrites every coverage/<project root>/lcov.info so its `SF:` paths are repo-relative, which is
// what SonarCloud matches against its sources. Test runners write them relative to wherever they
// ran: Vitest to the config's root, and Jest under Nx 24 to each project's root (it runs from
// there), so an api library's report says `SF:src/lib/x.ts` for libs/api/utils/src/lib/x.ts and
// Sonar finds no such file. Every report is found under coverage/ rather than listed, so a new
// project's report is not silently left with paths Sonar cannot match. A sharded run writes one
// report per shard, coverage/<project root>/shard-<n>/lcov.info: the shard folder is not part of
// the project root.

export type LcovReport = {
  path: string
  sourcePrefix: string
}

/** Top-level directories of a path written relative to the project root that produced it. */
const PROJECT_RELATIVE_ROOTS = ['src/', 'app/', 'tests/', 'test/']

/** A folder a sharded test run adds below the project's coverage directory: `shard-1`, `shard_2`. */
const SHARD_DIR = /^shard[-_]?\d+$/i

/** The project root a report's directory names: its path under `coverageDir`, minus shard folders. */
export function projectRootOf(reportDir: string, coverageDir = 'coverage'): string {
  const segments = posix.relative(coverageDir, reportDir).split('/')
  while (segments.length > 1 && SHARD_DIR.test(segments.at(-1) ?? '')) segments.pop()
  return segments.join('/')
}

/** The `SF:` line rewritten to a repo-relative path; every other line unchanged. */
export function normalizeSourceFile(line: string, sourcePrefix: string, repoRoot: string): string {
  if (!line.startsWith('SF:')) {
    return line
  }

  const sourceFile = line.slice(3).replaceAll('\\', '/')
  const root = repoRoot.replaceAll('\\', '/')
  const relativeSourceFile = sourceFile.startsWith(`${root}/`)
    ? sourceFile.slice(root.length + 1)
    : sourceFile

  if (relativeSourceFile.startsWith(`${sourcePrefix}/`)) {
    return `SF:${relativeSourceFile}`
  }

  if (PROJECT_RELATIVE_ROOTS.some(dir => relativeSourceFile.startsWith(dir))) {
    return `SF:${sourcePrefix}/${relativeSourceFile}`
  }

  // `../../libs/x/src/y.ts` from a project two levels down: resolve it against the project.
  if (relativeSourceFile.startsWith('../')) {
    const resolved = posix.normalize(`${sourcePrefix}/${relativeSourceFile}`)
    if (!resolved.startsWith('../')) return `SF:${resolved}`
  }

  return `SF:${relativeSourceFile}`
}

export function normalizeLcov(lcov: string, sourcePrefix: string, repoRoot: string): string {
  return lcov
    .split('\n')
    .map(line => normalizeSourceFile(line, sourcePrefix, repoRoot))
    .join('\n')
}

/** Every lcov.info under `coverageDir`, each with the project root its directory names. */
export function findLcovReports(repoRoot: string, coverageDir = 'coverage'): LcovReport[] {
  const reports: LcovReport[] = []
  const walk = (relativeDir: string) => {
    const absoluteDir = join(repoRoot, relativeDir)
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = posix.join(relativeDir, entry.name)
      if (entry.isDirectory()) {
        // Vitest and Jest also write an HTML report beside the lcov; it holds no lcov.info.
        if (entry.name !== 'lcov-report') walk(relativePath)
      } else if (entry.name === 'lcov.info' && relativeDir !== coverageDir) {
        reports.push({
          path: relativePath,
          sourcePrefix: projectRootOf(relativeDir, coverageDir),
        })
      }
    }
  }
  if (existsSync(join(repoRoot, coverageDir))) walk(coverageDir)
  return reports.sort((a, b) => a.path.localeCompare(b.path))
}

/** Rewrites each report in place; returns the paths it changed. */
export function normalizeLcovReports(repoRoot: string, coverageDir = 'coverage'): string[] {
  const changed: string[] = []
  for (const report of findLcovReports(repoRoot, coverageDir)) {
    const path = join(repoRoot, report.path)
    const lcov = readFileSync(path, 'utf8')
    const normalized = normalizeLcov(lcov, report.sourcePrefix, repoRoot)
    if (normalized !== lcov) {
      writeFileSync(path, normalized)
      changed.push(report.path)
    }
  }
  return changed
}
