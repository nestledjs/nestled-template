import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

// .githooks/pre-commit run against a throwaway repository. Prettier is replaced by a stand-in that
// rewrites UNFORMATTED to formatted in the files it is given, so the test sees exactly which files
// the hook formatted and what it re-staged, without depending on node_modules. gitleaks is kept off
// PATH, so its step is skipped.

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const hookSource = join(workspaceRoot, '.githooks', 'pre-commit')

const FAKE_PRETTIER = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('node:fs')
const files = process.argv.slice(process.argv.indexOf('--') + 1)
for (const file of files) writeFileSync(file, readFileSync(file, 'utf8').replaceAll('UNFORMATTED', 'formatted'))
`

let repo

function git(...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout
}

function runHook() {
  // PATH keeps only git's and node's directories, so a locally installed gitleaks is not found.
  const gitPath = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  const path = [dirname(process.execPath), dirname(gitPath), '/usr/bin', '/bin'].join(':')
  return spawnSync('sh', [join(repo, '.githooks', 'pre-commit')], {
    cwd: repo,
    encoding: 'utf8',
    env: { PATH: path, HOME: repo, GIT_CONFIG_NOSYSTEM: '1' },
  })
}

function indexCopy(path) {
  return git('show', `:${path}`)
}

describe('.githooks/pre-commit', () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'pre-commit-hook-'))
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    git('config', 'commit.gpgsign', 'false')
    mkdirSync(join(repo, '.githooks'))
    copyFileSync(hookSource, join(repo, '.githooks', 'pre-commit'))
    mkdirSync(join(repo, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(join(repo, 'node_modules', '.bin', 'prettier'), FAKE_PRETTIER)
    chmodSync(join(repo, 'node_modules', '.bin', 'prettier'), 0o755)
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\n.claude/\n')
    writeFileSync(join(repo, 'app.ts'), 'one\n')
    git('add', '.gitignore', 'app.ts')
    git('commit', '-q', '--no-verify', '-m', 'initial')
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('formats a fully staged file and re-stages it', () => {
    writeFileSync(join(repo, 'app.ts'), 'one\nUNFORMATTED\n')
    git('add', 'app.ts')

    const result = runHook()

    assert.equal(result.status, 0, result.stderr)
    assert.equal(indexCopy('app.ts'), 'one\nformatted\n')
    assert.equal(readFileSync(join(repo, 'app.ts'), 'utf8'), 'one\nformatted\n')
  })

  it('refuses a partially staged file and leaves the index and work tree alone', () => {
    writeFileSync(join(repo, 'app.ts'), 'one\nUNFORMATTED staged\n')
    git('add', 'app.ts')
    writeFileSync(join(repo, 'app.ts'), 'one\nUNFORMATTED staged\nnot staged\n')

    const result = runHook()

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /REFUSED/)
    assert.match(result.stderr, /^ {2}app\.ts$/m)
    // Nothing was formatted, and above all the unstaged line did not reach the index.
    assert.equal(indexCopy('app.ts'), 'one\nUNFORMATTED staged\n')
    assert.equal(
      readFileSync(join(repo, 'app.ts'), 'utf8'),
      'one\nUNFORMATTED staged\nnot staged\n',
    )
  })

  it('re-stages a force-added file that matches .gitignore', () => {
    mkdirSync(join(repo, '.claude'))
    writeFileSync(join(repo, '.claude', 'settings.json'), '{"UNFORMATTED": true}\n')
    git('add', '-f', '.claude/settings.json')

    const result = runHook()

    assert.equal(result.status, 0, result.stderr)
    assert.equal(indexCopy('.claude/settings.json'), '{"formatted": true}\n')
  })

  it('does nothing when nothing is staged', () => {
    const result = runHook()

    assert.equal(result.status, 0, result.stderr)
  })
})
