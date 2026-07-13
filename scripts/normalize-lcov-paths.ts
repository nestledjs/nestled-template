import { existsSync, readFileSync, writeFileSync } from 'node:fs'

type LcovReport = {
  path: string
  sourcePrefix: string
}

const reports: LcovReport[] = [
  { path: 'coverage/apps/web/lcov.info', sourcePrefix: 'apps/web' },
  { path: 'coverage/apps/api-e2e/lcov.info', sourcePrefix: 'apps/api-e2e' },
  { path: 'coverage/libs/web-ui/lcov.info', sourcePrefix: 'libs/web-ui' },
  { path: 'coverage/libs/web/lcov.info', sourcePrefix: 'libs/web' },
  { path: 'coverage/libs/data-browser/lcov.info', sourcePrefix: 'libs/data-browser' },
  { path: 'coverage/libs/shared-components/lcov.info', sourcePrefix: 'libs/shared-components' },
  { path: 'coverage/libs/shared/apollo/lcov.info', sourcePrefix: 'libs/shared/apollo' },
  { path: 'coverage/libs/shared/utils/lcov.info', sourcePrefix: 'libs/shared/utils' },
  { path: 'coverage/libs/shared/sdk/lcov.info', sourcePrefix: 'libs/shared/sdk' },
]

const repoRoot = process.cwd().replaceAll('\\', '/')

const normalizeSourceFile = (line: string, sourcePrefix: string): string => {
  if (!line.startsWith('SF:')) {
    return line
  }

  const sourceFile = line.slice(3).replaceAll('\\', '/')
  const relativeSourceFile = sourceFile.startsWith(`${repoRoot}/`)
    ? sourceFile.slice(repoRoot.length + 1)
    : sourceFile

  if (relativeSourceFile.startsWith(`${sourcePrefix}/`)) {
    return `SF:${relativeSourceFile}`
  }

  if (
    relativeSourceFile.startsWith('src/') ||
    relativeSourceFile.startsWith('app/') ||
    relativeSourceFile.startsWith('tests/')
  ) {
    return `SF:${sourcePrefix}/${relativeSourceFile}`
  }

  return `SF:${relativeSourceFile}`
}

for (const report of reports) {
  if (!existsSync(report.path)) {
    continue
  }

  const lcov = readFileSync(report.path, 'utf8')
  const normalized = lcov
    .split('\n')
    .map(line => normalizeSourceFile(line, report.sourcePrefix))
    .join('\n')

  if (normalized !== lcov) {
    writeFileSync(report.path, normalized)
  }
}
