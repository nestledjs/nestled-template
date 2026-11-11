import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'

// Rewrites every coverage/<project root>/lcov.info so its `SF:` paths are repo-relative, which is
// what SonarCloud matches against its sources. Test runners write them relative to wherever they
// ran: Vitest to the config's root, and Jest under Nx 24 to each project's root (it runs from
// there), so an api library's report says `SF:src/lib/x.ts` for libs/api/utils/src/lib/x.ts and
// Sonar finds no such file. Every report is found under coverage/ rather than listed, so a new
// project's report is not silently left with paths Sonar cannot match.

export type LcovReport = {
  path: string
  sourcePrefix: string
}

/** Top-level directories of a path written relative to the project root that produced it. */
const PROJECT_RELATIVE_ROOTS = ['src/', 'app/', 'tests/', 'test/']

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
          sourcePrefix: posix.relative(coverageDir, relativeDir),
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = normalizeLcovReports(process.cwd())
  for (const path of changed) console.log(`normalized ${path}`)
}
