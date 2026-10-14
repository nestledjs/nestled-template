import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { devDockerSettings, mainCheckoutRoot } from './dev-checkout.mjs'
import { gitExecutable } from './typecheck-project.mjs'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const scratch = []

afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true })
})

function directory(prefix) {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  scratch.push(path)
  return path
}

function git(cwd, ...args) {
  const result = spawnSync(
    gitExecutable(),
    ['-c', 'user.name=spec', '-c', 'user.email=spec@example.invalid', ...args],
    { cwd, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
}

// A repository with the dev-docker scripts, a linked worktree of it, and a plain folder outside git
// holding the same scripts. Docker is a stub that prints what compose would be given.
function checkouts() {
  const base = directory('dev-checkout-')
  const main = join(base, 'main')
  const worktree = join(base, 'worktree')
  const outside = join(base, 'outside')
  for (const root of [main, outside]) {
    mkdirSync(join(root, 'scripts'), { recursive: true })
    mkdirSync(join(root, '.dev'))
    for (const script of ['dev-docker.sh', 'dev-checkout.sh', 'test-db.sh']) {
      copyFileSync(join(workspaceRoot, 'scripts', script), join(root, 'scripts', script))
    }
    writeFileSync(join(root, '.dev/docker-compose.yml'), 'services: {}\n')
  }
  git(main, 'init', '-q')
  git(main, 'add', '.')
  git(main, 'commit', '-q', '-m', 'fixture')
  git(main, 'worktree', 'add', '-q', worktree)
  const bin = join(base, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'docker'),
    '#!/bin/bash\nprintf "args=%s\\n" "$*"\nprintf "data=%s\\n" "${NESTLED_DEV_DATA_DIR:-}"\n',
    { mode: 0o755 },
  )
  return { main, worktree, outside, bin }
}

function devDocker(root, bin, env = {}) {
  const result = spawnSync('bash', [join(root, 'scripts/dev-docker.sh'), 'config'], {
    cwd: root,
    env: { ...process.env, NESTLED_DEV_DATA_DIR: '', PATH: `${bin}:${process.env.PATH}`, ...env },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const [args, data] = result.stdout.trim().split('\n')
  return { args: args.replace(/^args=/, ''), data: data.replace(/^data=/, '') }
}

void describe('dev checkout resolution (node)', () => {
  void it('resolves a main checkout, a linked worktree and a folder outside git', () => {
    const { main, worktree, outside } = checkouts()
    assert.equal(mainCheckoutRoot(main), main)
    assert.equal(mainCheckoutRoot(worktree), main)
    assert.equal(mainCheckoutRoot(outside), outside)
  })

  void it('gives a worktree the main .env and data directory, and a main checkout nothing new', () => {
    const { main, worktree } = checkouts()
    writeFileSync(join(main, '.env'), 'POSTGRES_PORT=55432\n')
    assert.deepEqual(devDockerSettings(main, {}), {
      mainCheckout: main,
      envFile: join(main, '.env'),
      composeVariables: {},
    })
    assert.deepEqual(devDockerSettings(worktree, {}), {
      mainCheckout: main,
      envFile: join(main, '.env'),
      composeVariables: { NESTLED_DEV_DATA_DIR: join(main, '.dev', 'tmp') },
    })
  })

  void it("prefers a worktree's own .env and leaves an explicit data directory alone", () => {
    const { main, worktree } = checkouts()
    writeFileSync(join(worktree, '.env'), 'POSTGRES_PORT=55432\n')
    assert.equal(devDockerSettings(worktree, {}).envFile, join(worktree, '.env'))
    assert.deepEqual(
      devDockerSettings(worktree, { NESTLED_DEV_DATA_DIR: '/data' }).composeVariables,
      {},
    )
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR=/elsewhere\n')
    rmSync(join(worktree, '.env'))
    assert.deepEqual(devDockerSettings(worktree, {}).composeVariables, {})
  })

  void it('treats an empty or quoted-empty .env setting as unset', () => {
    const { main, worktree } = checkouts()
    const dataDir = { NESTLED_DEV_DATA_DIR: join(main, '.dev', 'tmp') }
    for (const line of [
      'NESTLED_DEV_DATA_DIR=',
      "NESTLED_DEV_DATA_DIR=''",
      'NESTLED_DEV_DATA_DIR=""',
    ]) {
      writeFileSync(join(main, '.env'), `${line}\n`)
      assert.deepEqual(devDockerSettings(worktree, {}).composeVariables, dataDir, line)
    }
    writeFileSync(join(main, '.env'), 'export NESTLED_DEV_DATA_DIR = "/elsewhere"\n')
    assert.deepEqual(devDockerSettings(worktree, {}).composeVariables, {})
  })

  void it('has no .env to offer when neither checkout has one', () => {
    const { worktree } = checkouts()
    assert.equal(devDockerSettings(worktree, {}).envFile, undefined)
  })
})

void describe('dev checkout resolution (scripts/dev-docker.sh)', () => {
  void it('runs a single checkout exactly as before', () => {
    const { main, bin } = checkouts()
    assert.deepEqual(devDocker(main, bin), {
      args: `compose -f ${main}/.dev/docker-compose.yml config`,
      data: '',
    })
    writeFileSync(join(main, '.env'), 'POSTGRES_PORT=55432\n')
    assert.equal(
      devDocker(main, bin).args,
      `compose --env-file ${main}/.env -f ${main}/.dev/docker-compose.yml config`,
    )
  })

  void it('points a worktree at the main checkout .env and data directory', () => {
    const { main, worktree, bin } = checkouts()
    writeFileSync(join(main, '.env'), 'POSTGRES_PORT=55432\n')
    assert.deepEqual(devDocker(worktree, bin), {
      args: `compose --env-file ${main}/.env -f ${worktree}/.dev/docker-compose.yml config`,
      data: `${main}/.dev/tmp`,
    })
    assert.equal(devDocker(worktree, bin, { NESTLED_DEV_DATA_DIR: '/data' }).data, '/data')
  })

  void it('treats an empty or quoted-empty .env setting as unset, and honours a real one', () => {
    const { main, worktree, bin } = checkouts()
    for (const line of [
      'NESTLED_DEV_DATA_DIR=',
      "NESTLED_DEV_DATA_DIR=''",
      'NESTLED_DEV_DATA_DIR=""',
    ]) {
      writeFileSync(join(main, '.env'), `${line}\n`)
      assert.equal(devDocker(worktree, bin).data, `${main}/.dev/tmp`, line)
    }
    writeFileSync(join(main, '.env'), 'export NESTLED_DEV_DATA_DIR=/elsewhere\n')
    assert.equal(devDocker(worktree, bin).data, '')
  })

  void it('test-db.sh resets the data directory an `export` line in .env configures', () => {
    const { main, bin } = checkouts()
    const configured = join(main, 'configured-data')
    writeFileSync(join(main, '.env'), `export NESTLED_DEV_DATA_DIR = ${configured}\n`)
    mkdirSync(join(configured, 'postgres-test'), { recursive: true })
    mkdirSync(join(main, '.dev/tmp/postgres-test'), { recursive: true })
    const env = { ...process.env, NESTLED_DEV_DATA_DIR: '', PATH: `${bin}:${process.env.PATH}` }
    const reset = spawnSync('bash', [join(main, 'scripts/test-db.sh'), 'reset'], {
      cwd: main,
      env,
      encoding: 'utf8',
    })
    assert.equal(reset.status, 0, reset.stderr)
    assert.equal(existsSync(join(configured, 'postgres-test')), false)
    assert.equal(existsSync(join(main, '.dev/tmp/postgres-test')), true)
  })

  void it('test-db.sh resets a quoted data directory that has a trailing comment', () => {
    const { main, bin } = checkouts()
    const configured = join(main, 'data # with hash')
    writeFileSync(join(main, '.env'), `NESTLED_DEV_DATA_DIR="${configured}" # shared data\n`)
    mkdirSync(join(configured, 'postgres-test'), { recursive: true })
    const reset = spawnSync('bash', [join(main, 'scripts/test-db.sh'), 'reset'], {
      cwd: main,
      env: { ...process.env, NESTLED_DEV_DATA_DIR: '', PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    })
    assert.equal(reset.status, 0, reset.stderr)
    assert.equal(existsSync(join(configured, 'postgres-test')), false)
  })

  void it('treats a folder outside git as its own checkout', () => {
    const { outside, bin } = checkouts()
    assert.deepEqual(devDocker(outside, bin), {
      args: `compose -f ${outside}/.dev/docker-compose.yml config`,
      data: '',
    })
  })

  void it('test-db.sh in a worktree reads the main .env and resets the main data directory', () => {
    const { main, worktree, bin } = checkouts()
    writeFileSync(join(main, '.env'), 'POSTGRES_TEST_PORT=55433\n')
    const env = { ...process.env, NESTLED_DEV_DATA_DIR: '', PATH: `${bin}:${process.env.PATH}` }
    delete env.TEST_DATABASE_URL
    delete env.POSTGRES_TEST_PORT
    const url = spawnSync('bash', [join(worktree, 'scripts/test-db.sh'), 'url'], {
      cwd: worktree,
      env,
      encoding: 'utf8',
    })
    assert.equal(
      url.stdout.trim(),
      'postgresql://postgres:postgres@localhost:55433/nestled_template_test',
    )
    const mainData = join(main, '.dev/tmp/postgres-test')
    const worktreeData = join(worktree, '.dev/tmp/postgres-test')
    mkdirSync(mainData, { recursive: true })
    mkdirSync(worktreeData, { recursive: true })
    const reset = spawnSync('bash', [join(worktree, 'scripts/test-db.sh'), 'reset'], {
      cwd: worktree,
      env,
      encoding: 'utf8',
    })
    assert.equal(reset.status, 0, reset.stderr)
    assert.equal(existsSync(mainData), false)
    assert.equal(existsSync(worktreeData), true)
  })
})
