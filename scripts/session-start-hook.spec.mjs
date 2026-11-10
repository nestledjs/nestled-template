import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

// .claude/hooks/session-start.sh as a cloud session runs it, in a throwaway checkout. PATH is a
// directory of symlinks to the few tools the hook uses, so a test decides whether git exists.
// `pnpm` is a stand-in that records its arguments, so nothing is installed.

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const hook = join(workspaceRoot, '.claude', 'hooks', 'session-start.sh')
const SCHEMA = 'libs/api/prisma/src/lib/schemas/schema.prisma'

let checkout
let bin

function which(tool) {
  return spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim()
}

function provideTools(withGit) {
  bin = join(checkout, '.bin')
  mkdirSync(bin)
  const tools = ['sh', 'cut', 'tr', 'cat', 'tail', 'node']
  if (withGit) tools.push('git')
  for (const tool of tools)
    symlinkSync(tool === 'node' ? process.execPath : which(tool), join(bin, tool))
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/sh\necho "$*" >> "${join(checkout, 'pnpm-calls.log')}"\n`,
  )
  chmodSync(join(bin, 'pnpm'), 0o755)
}

function runHook(projectDir = checkout) {
  return spawnSync(join(bin, 'sh'), [hook], {
    cwd: checkout,
    encoding: 'utf8',
    env: {
      PATH: bin,
      HOME: checkout,
      CLAUDE_CODE_REMOTE: 'true',
      CLAUDE_PROJECT_DIR: projectDir,
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
}

function pnpmCalls() {
  try {
    return readFileSync(join(checkout, 'pnpm-calls.log'), 'utf8').trim().split('\n')
  } catch {
    return []
  }
}

describe('.claude/hooks/session-start.sh', () => {
  beforeEach(() => {
    checkout = mkdtempSync(join(tmpdir(), 'session-start-hook-'))
    writeFileSync(join(checkout, '.nvmrc'), `${process.versions.node}\n`)
    writeFileSync(join(checkout, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    mkdirSync(join(checkout, dirname(SCHEMA)), { recursive: true })
    writeFileSync(join(checkout, SCHEMA), 'generator client {}\n')
  })

  afterEach(() => {
    rmSync(checkout, { recursive: true, force: true })
  })

  it('installs and exits 0 when git is missing, saying so', () => {
    provideTools(false)

    const result = runHook()

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /git is not installed/)
    assert.deepEqual(pnpmCalls(), ['install --frozen-lockfile', 'prisma:generate'])
  })

  it('installs and exits 0 when the Prisma schema is missing, saying so', () => {
    provideTools(true)
    spawnSync(join(bin, 'git'), ['init', '-q'], { cwd: checkout })
    rmSync(join(checkout, SCHEMA))

    const result = runHook()

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, new RegExp(`missing ${SCHEMA.replaceAll('.', '\\.')}`))
    assert.deepEqual(pnpmCalls(), ['install --frozen-lockfile', 'prisma:generate'])
  })

  it('exits 0 with a message when the project directory does not exist', () => {
    provideTools(true)

    const result = runHook(join(checkout, 'no-such-dir'))

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /does not exist/)
    assert.deepEqual(pnpmCalls(), [])
  })

  it('fingerprints the inputs and skips the next session once current', () => {
    provideTools(true)
    spawnSync(join(bin, 'git'), ['init', '-q'], { cwd: checkout })
    spawnSync(join(bin, 'git'), ['config', 'core.hooksPath', '.githooks'], { cwd: checkout })
    mkdirSync(join(checkout, 'node_modules'))
    mkdirSync(join(checkout, 'libs/api/prisma/src/lib/prisma-generated'), { recursive: true })

    assert.equal(runHook().status, 0)
    const second = runHook()

    assert.equal(second.status, 0, second.stderr)
    assert.match(second.stdout, /already current/)
    assert.deepEqual(pnpmCalls(), ['install --frozen-lockfile', 'prisma:generate'])
  })
})
