import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A test run leaves no untracked files. Coverage goes to coverage/<project root>/ at the repo root
 * here, sometimes one shard-<n>/ folder per shard, but a project whose Jest or Vitest config keeps
 * the default (`coverage` beside its own config, as a tools/ plugin's often does) writes
 * <folder>/coverage/, and `/coverage` in .gitignore matched only the root one. Beside these fixed
 * examples, every folder holding a tracked file is checked, with or without a project.json, so a
 * plugin or a shard is covered whatever the app calls it and however it is configured.
 */
const TEST_OUTPUT = [
  'coverage/apps/web/lcov.info',
  'coverage/libs/api/utils/shard-1/lcov.info',
  'tools/workspace-plugin/coverage/lcov.info',
  'tools/workspace-plugin/coverage/lcov-report/index.html',
  'tools/some-plugin/coverage/lcov.info',
  'tools/some-plugin/coverage/lcov-report/index.html',
  'libs/some-lib/coverage/coverage-final.json',
  'apps/some-app/coverage/lcov.info',
]

/**
 * More test output this repository writes, one repo-relative path each, as a JSON array: a report
 * folder or file name of the app's own that the checks here would not guess. It is the app's own
 * list, kept outside this spec so an upgrade that replaces the spec leaves it alone. Empty in the
 * template; an absent file counts as empty.
 */
const KNOWN_TEST_OUTPUT = 'scripts/known-test-output.json'

/**
 * Tracked files this repository keeps although .gitignore matches them, one repo-relative path
 * each, as a JSON array. It is the app's own list, kept outside this spec so an upgrade that
 * replaces the spec leaves it alone. Empty in the template.
 */
const KNOWN_TRACKED_IGNORED = 'scripts/known-tracked-ignored.json'

// The repository's own ignore rules only: a developer's global excludes file must not decide it.
const git = args => ['-c', 'core.excludesFile=/dev/null', ...args]

/** The paths in `paths` that the .gitignore of the repository at `cwd` does not ignore. */
export function notIgnored(paths, cwd = root) {
  if (paths.length === 0) return []
  // One git call for every path; exit 1 only means none of them is ignored.
  const input = paths.join('\0') + '\0'
  const result = spawnSync('git', git(['check-ignore', '--no-index', '--stdin', '-z']), {
    cwd,
    input,
    encoding: 'utf8',
    // Git echoes each ignored path, so the output is at most the input: size the buffer for it,
    // not spawnSync's 1 MiB default, which a repository with many folders would exceed.
    maxBuffer: Buffer.byteLength(input) + 1024 * 1024,
  })
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed: ${result.stderr || result.error}`)
  }
  const ignored = new Set(result.stdout.split('\0').filter(Boolean))
  return paths.filter(path => !ignored.has(path))
}

/** Every folder that holds a tracked file, at any depth, but the repository root. */
export function trackedFolders(trackedFiles) {
  const folders = new Set()
  for (const file of trackedFiles) {
    for (let folder = posix.dirname(file); folder !== '.'; folder = posix.dirname(folder)) {
      if (folders.has(folder)) break
      folders.add(folder)
    }
  }
  return [...folders].sort()
}

/**
 * Where a test run could write coverage for each tracked folder: beside its own config, as one
 * shard of it, and under the root coverage/ folder. Discovery does not depend on project.json, so
 * a tools/ plugin or a library configured some other way is still checked.
 */
export function coverageOutputCandidates(trackedFiles) {
  return trackedFolders(trackedFiles)
    .filter(folder => !folder.split('/').includes('coverage'))
    .flatMap(folder => [
      `${folder}/coverage/lcov.info`,
      `${folder}/coverage/shard-1/lcov.info`,
      `coverage/${folder}/lcov.info`,
      `coverage/${folder}/shard-1/lcov.info`,
    ])
}

/** The repo-local list at `path`: an array of repo-relative paths, or none when the file is absent. */
export function readPathList(path) {
  if (!existsSync(path)) return []
  const list = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(list) || !list.every(entry => typeof entry === 'string')) {
    throw new TypeError(`${path} must be a JSON array of repo-relative paths`)
  }
  return list
}

/** The allowlist at `path`: an array of paths, or none when the file is absent. */
export const readKnownTrackedIgnored = readPathList

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

function trackedFiles(cwd = root) {
  return execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' }).split('\n').filter(Boolean)
}

describe('.gitignore', () => {
  it('ignores coverage output wherever a project writes it', () => {
    assert.deepEqual(
      notIgnored([
        ...TEST_OUTPUT,
        ...readPathList(join(root, KNOWN_TEST_OUTPUT)),
        ...coverageOutputCandidates(trackedFiles()),
      ]),
      [],
    )
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

describe('coverage output discovery', () => {
  it('checks a folder with no project.json, and every folder above it', () => {
    const candidates = coverageOutputCandidates([
      'project.json',
      'tools/nx-plugins/typecheck.js',
      'apps/web/src/a.ts',
    ])
    for (const expected of [
      'tools/nx-plugins/coverage/lcov.info',
      'tools/coverage/lcov.info',
      'apps/web/coverage/lcov.info',
      'apps/web/src/coverage/lcov.info',
    ]) {
      assert.ok(candidates.includes(expected), `${expected} is not checked`)
    }
  })

  it('checks a shard folder beside a project and under the root coverage folder', () => {
    const candidates = coverageOutputCandidates(['libs/api/custom/jest.config.ts'])
    assert.ok(candidates.includes('libs/api/custom/coverage/shard-1/lcov.info'))
    assert.ok(candidates.includes('coverage/libs/api/custom/shard-1/lcov.info'))
  })

  it('never checks the repository root or a tracked coverage folder as a project', () => {
    const candidates = coverageOutputCandidates(['README.md', 'docs/coverage/notes.md'])
    assert.ok(!candidates.some(path => path.startsWith('coverage/coverage')))
    assert.ok(!candidates.includes('coverage/lcov.info'))
    assert.ok(!candidates.some(path => path.startsWith('docs/coverage/coverage')))
  })

  it('finds coverage a narrower .gitignore misses in a folder with no project.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitignore-test-output-'))
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: dir })
      writeFileSync(join(dir, '.gitignore'), '/coverage\napps/*/coverage\n')
      mkdirSync(join(dir, 'apps/web'), { recursive: true })
      mkdirSync(join(dir, 'tools/plugin'), { recursive: true })
      writeFileSync(join(dir, 'apps/web/project.json'), '{}\n')
      writeFileSync(join(dir, 'tools/plugin/index.js'), '\n')
      execFileSync('git', ['add', '.'], { cwd: dir })
      const missed = notIgnored(coverageOutputCandidates(trackedFiles(dir)), dir)
      assert.deepEqual(missed, [
        'apps/coverage/lcov.info',
        'apps/coverage/shard-1/lcov.info',
        'tools/coverage/lcov.info',
        'tools/coverage/shard-1/lcov.info',
        'tools/plugin/coverage/lcov.info',
        'tools/plugin/coverage/shard-1/lcov.info',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the known test output list', () => {
  it('is checked beside the fixed examples, and reads an absent file as empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'known-test-output-'))
    try {
      assert.deepEqual(readPathList(join(dir, 'missing.json')), [])
      const file = join(dir, 'list.json')
      writeFileSync(file, '["reports/junit/api.xml"]\n')
      assert.deepEqual(readPathList(file), ['reports/junit/api.xml'])
      writeFileSync(file, '"reports/junit/api.xml"\n')
      assert.throws(() => readPathList(file), /must be a JSON array/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
