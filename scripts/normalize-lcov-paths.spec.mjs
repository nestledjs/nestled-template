import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'

import {
  findLcovReports,
  normalizeLcov,
  normalizeLcovReports,
  normalizeSourceFile,
} from './normalize-lcov-paths.ts'

const repoRoot = '/work/repo'

describe('normalizeSourceFile', () => {
  it('prefixes a path Jest wrote relative to an api library root', () => {
    assert.equal(
      normalizeSourceFile('SF:src/lib/auth/session-cookie.ts', 'libs/api/utils', repoRoot),
      'SF:libs/api/utils/src/lib/auth/session-cookie.ts',
    )
  })

  it('strips the repo root from an absolute path', () => {
    assert.equal(
      normalizeSourceFile('SF:/work/repo/libs/api/custom/src/a.ts', 'libs/api/custom', repoRoot),
      'SF:libs/api/custom/src/a.ts',
    )
  })

  it('keeps a path that is already repo-relative', () => {
    assert.equal(
      normalizeSourceFile('SF:libs/api/config/src/a.ts', 'libs/api/config', repoRoot),
      'SF:libs/api/config/src/a.ts',
    )
  })

  it('prefixes app/ and tests/ paths from the web app', () => {
    assert.equal(
      normalizeSourceFile('SF:app/root.tsx', 'apps/web', repoRoot),
      'SF:apps/web/app/root.tsx',
    )
    assert.equal(
      normalizeSourceFile('SF:tests/helpers/x.ts', 'apps/web', repoRoot),
      'SF:apps/web/tests/helpers/x.ts',
    )
  })

  it('resolves a path that climbs out of the project', () => {
    assert.equal(
      normalizeSourceFile('SF:../../libs/web/src/a.ts', 'apps/web', repoRoot),
      'SF:libs/web/src/a.ts',
    )
  })

  it('converts Windows separators', () => {
    assert.equal(
      normalizeSourceFile('SF:C:\\work\\repo\\libs\\web\\src\\a.ts', 'libs/web', 'C:\\work\\repo'),
      'SF:libs/web/src/a.ts',
    )
  })

  it('leaves non-SF lines alone', () => {
    assert.equal(normalizeSourceFile('DA:1,1', 'libs/web', repoRoot), 'DA:1,1')
  })

  it('is idempotent', () => {
    const lcov = 'TN:\nSF:src/a.ts\nDA:1,1\nend_of_record\n'
    const once = normalizeLcov(lcov, 'libs/api/utils', repoRoot)
    assert.equal(normalizeLcov(once, 'libs/api/utils', repoRoot), once)
  })
})

describe('normalizeLcovReports', () => {
  const root = mkdtempSync(join(tmpdir(), 'lcov-paths-'))
  after(() => rmSync(root, { recursive: true, force: true }))

  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }

  write('coverage/libs/api/utils/lcov.info', 'TN:\nSF:src/lib/a.ts\nend_of_record\n')
  write('coverage/libs/api/core/data-access/lcov.info', 'TN:\nSF:src/lib/b.ts\nend_of_record\n')
  write('coverage/libs/api/utils/lcov-report/index.html', '<html></html>')
  write('coverage/apps/web/lcov.info', 'TN:\nSF:apps/web/app/root.tsx\nend_of_record\n')

  it('finds every project report under coverage/, with its project root', () => {
    assert.deepEqual(findLcovReports(root), [
      { path: 'coverage/apps/web/lcov.info', sourcePrefix: 'apps/web' },
      {
        path: 'coverage/libs/api/core/data-access/lcov.info',
        sourcePrefix: 'libs/api/core/data-access',
      },
      { path: 'coverage/libs/api/utils/lcov.info', sourcePrefix: 'libs/api/utils' },
    ])
  })

  it('rewrites the api libraries’ Jest reports to repo-relative paths', () => {
    const changed = normalizeLcovReports(root)

    assert.deepEqual(changed, [
      'coverage/libs/api/core/data-access/lcov.info',
      'coverage/libs/api/utils/lcov.info',
    ])
    assert.match(
      readFileSync(join(root, 'coverage/libs/api/utils/lcov.info'), 'utf8'),
      /^SF:libs\/api\/utils\/src\/lib\/a\.ts$/m,
    )
    assert.match(
      readFileSync(join(root, 'coverage/libs/api/core/data-access/lcov.info'), 'utf8'),
      /^SF:libs\/api\/core\/data-access\/src\/lib\/b\.ts$/m,
    )
  })

  it('returns nothing when there is no coverage directory', () => {
    assert.deepEqual(normalizeLcovReports(join(root, 'missing')), [])
  })
})
