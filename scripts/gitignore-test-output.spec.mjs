import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A test run leaves no untracked files. Coverage goes to coverage/<project root>/ at the repo root
 * here, but a project whose Jest or Vitest config keeps the default (`coverage` beside its own
 * config, as a tools/ plugin's often does) writes <project>/coverage/, and `/coverage` in
 * .gitignore matched only the root one. Every tracked project.json's folder is checked, so a
 * plugin is covered whatever the app calls it, beside these fixed examples.
 */
const TEST_OUTPUT = [
  'coverage/apps/web/lcov.info',
  'coverage/libs/api/utils/shard-1/lcov.info',
  'tools/some-plugin/coverage/lcov.info',
  'tools/some-plugin/coverage/lcov-report/index.html',
  'libs/some-lib/coverage/coverage-final.json',
  'apps/some-app/coverage/lcov.info',
]

/**
 * Tracked files this repository keeps although .gitignore matches them, one repo-relative path
 * each, as a JSON array. It is the app's own list, kept outside this spec so an upgrade that
 * replaces the spec leaves it alone. Empty in the template.
 */
const KNOWN_TRACKED_IGNORED = 'scripts/known-tracked-ignored.json'

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

/** Where each project with a tracked project.json would write coverage beside its own config. */
export function projectCoverageOutput(trackedFiles) {
  return trackedFiles
    .filter(file => posix.basename(file) === 'project.json' && posix.dirname(file) !== '.')
    .map(file => `${posix.dirname(file)}/coverage/lcov.info`)
}

/** The allowlist at `path`: an array of paths, or none when the file is absent. */
export function readKnownTrackedIgnored(path) {
  if (!existsSync(path)) return []
  const list = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(list) || !list.every(entry => typeof entry === 'string')) {
    throw new TypeError(`${path} must be a JSON array of repo-relative paths`)
  }
  return list
}

/**
 * Tracked-but-ignored files the allowlist does not name (`unlisted`), and allowlist entries that
 * are no longer tracked-but-ignored (`stale`), so the list cannot hide a file it no longer needs to.
 */
export function compareWithAllowlist(ignoredTracked, allowlist) {
  const allowed = new Set(allowlist)
  const found = new Set(ignoredTracked)
  return {
    unlisted: ignoredTracked.filter(file => !allowed.has(file)),
    stale: allowlist.filter(file => !found.has(file)),
  }
}

describe('.gitignore', () => {
  it('ignores coverage output wherever a project writes it', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    assert.deepEqual(notIgnored([...TEST_OUTPUT, ...projectCoverageOutput(tracked)]), [])
  })

  it('ignores no tracked file outside the known list', () => {
    const ignoredTracked = execFileSync(
      'git',
      git(['ls-files', '--cached', '--ignored', '--exclude-standard']),
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
    const { unlisted, stale } = compareWithAllowlist(
      ignoredTracked,
      readKnownTrackedIgnored(join(root, KNOWN_TRACKED_IGNORED)),
    )
    assert.deepEqual(unlisted, [], `untrack these, or list them in ${KNOWN_TRACKED_IGNORED}`)
    assert.deepEqual(stale, [], `remove these from ${KNOWN_TRACKED_IGNORED}`)
  })
})

describe('the known tracked-but-ignored list', () => {
  it('fails for a tracked-but-ignored file it does not name', () => {
    assert.deepEqual(compareWithAllowlist(['a/kept.bin', 'b/new.log'], ['a/kept.bin']), {
      unlisted: ['b/new.log'],
      stale: [],
    })
  })

  it('reports an entry that is no longer tracked-but-ignored', () => {
    assert.deepEqual(compareWithAllowlist([], ['a/kept.bin']), {
      unlisted: [],
      stale: ['a/kept.bin'],
    })
  })

  it('reads an absent file as empty and rejects anything but an array of paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'known-tracked-ignored-'))
    try {
      assert.deepEqual(readKnownTrackedIgnored(join(dir, 'missing.json')), [])
      const file = join(dir, 'list.json')
      writeFileSync(file, '["a/kept.bin"]\n')
      assert.deepEqual(readKnownTrackedIgnored(file), ['a/kept.bin'])
      writeFileSync(file, '{"files": ["a/kept.bin"]}\n')
      assert.throws(() => readKnownTrackedIgnored(file), /must be a JSON array/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('project coverage output', () => {
  it('names the coverage folder beside every project.json but the root one', () => {
    assert.deepEqual(
      projectCoverageOutput(['project.json', 'tools/my-plugin/project.json', 'apps/web/src/a.ts']),
      ['tools/my-plugin/coverage/lcov.info'],
    )
  })
})
