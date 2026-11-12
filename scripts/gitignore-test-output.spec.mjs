import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A test run leaves no untracked files. Coverage goes to coverage/<project root>/ at the repo root
 * here, but a project whose Jest or Vitest config keeps the default (`coverage` beside its own
 * config, as a tools/ plugin's often does) writes <project>/coverage/, and `/coverage` in
 * .gitignore matched only the root one.
 */
const TEST_OUTPUT = [
  'coverage/apps/web/lcov.info',
  'coverage/libs/api/utils/shard-1/lcov.info',
  'tools/workspace-plugin/coverage/lcov.info',
  'tools/workspace-plugin/coverage/lcov-report/index.html',
  'libs/some-lib/coverage/coverage-final.json',
  'apps/some-app/coverage/lcov.info',
]

// The repository's own ignore rules only: a developer's global excludes file must not decide it.
const git = args => ['-c', 'core.excludesFile=/dev/null', ...args]

/** The paths in `paths` that .gitignore does not ignore. */
function notIgnored(paths) {
  return paths.filter(path => {
    const result = spawnSync('git', git(['check-ignore', '--quiet', '--no-index', path]), {
      cwd: root,
    })
    return result.status !== 0
  })
}

describe('.gitignore', () => {
  it('ignores coverage output wherever a project writes it', () => {
    assert.deepEqual(notIgnored(TEST_OUTPUT), [])
  })

  it('ignores no tracked file', () => {
    const ignoredTracked = execFileSync(
      'git',
      git(['ls-files', '--cached', '--ignored', '--exclude-standard']),
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
    assert.deepEqual(ignoredTracked, [])
  })
})
