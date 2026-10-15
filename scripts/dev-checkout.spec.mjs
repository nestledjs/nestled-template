import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  definesVariable,
  devDockerSettings,
  lastAssignment,
  mainCheckoutRoot,
} from './dev-checkout.mjs'
import { gitExecutable } from './typecheck-project.mjs'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const scriptsDir = join(workspaceRoot, 'scripts')

// The scripts under test and every helper they source (`source "$X/<name>.sh"`), followed through
// the helpers, so a new helper is copied into the fixtures without editing this list.
function scriptsWithHelpers(entryPoints) {
  const scripts = new Set()
  const pending = [...entryPoints]
  while (pending.length > 0) {
    const script = pending.pop()
    if (scripts.has(script)) continue
    scripts.add(script)
    const text = readFileSync(join(scriptsDir, script), 'utf8')
    for (const [, helper] of text.matchAll(/^\s*(?:source|\.)\s+"[^"\n]*\/([\w.-]+\.sh)"/gm)) {
      pending.push(helper)
    }
  }
  return [...scripts]
}

const fixtureScripts = scriptsWithHelpers(['dev-docker.sh', 'test-db.sh'])

// The test database's default name, as test-db.sh builds its default URL (a clone renames it).
const testDatabaseName = /localhost:\$\{TEST_DB_PORT\}\/([\w-]+)/.exec(
  readFileSync(join(scriptsDir, 'test-db.sh'), 'utf8'),
)?.[1]
assert.ok(testDatabaseName, 'test-db.sh builds its default URL from TEST_DB_PORT')
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
    for (const script of fixtureScripts) {
      copyFileSync(join(scriptsDir, script), join(root, 'scripts', script))
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
    '#!/bin/bash\nprintf "args=%s\\n" "$*"\nprintf "data=%s\\n" "${NESTLED_DEV_DATA_DIR:-}"\nprintf "exported=%s\\n" "${NESTLED_DEV_DATA_DIR+yes}"\n',
    { mode: 0o755 },
  )
  return { main, worktree, outside, bin }
}

function withoutExported({ args, data }) {
  return { args, data }
}

function devDocker(root, bin, env = {}) {
  const result = spawnSync('bash', [join(root, 'scripts/dev-docker.sh'), 'config'], {
    cwd: root,
    env: { ...process.env, NESTLED_DEV_DATA_DIR: '', PATH: `${bin}:${process.env.PATH}`, ...env },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const [args, data, exported] = result.stdout.trim().split('\n')
  return {
    args: args.replace(/^args=/, ''),
    data: data.replace(/^data=/, ''),
    exported: exported.replace(/^exported=/, '') === 'yes',
  }
}

void describe('dev checkout resolution (node)', () => {
  void it('copies every helper the scripts source into the fixtures', () => {
    assert.ok(fixtureScripts.includes('dev-checkout.sh'), fixtureScripts.join(', '))
  })

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

  void it('reads the last assignment of a key, as compose does', () => {
    const contents = [
      'NESTLED_DEV_DATA_DIR=/first',
      'NESTLED_DEV_DATA_DIR_OTHER=/not-this-key',
      '  export   NESTLED_DEV_DATA_DIR =  /last  ',
      '',
    ].join('\n')
    assert.equal(lastAssignment(contents, 'NESTLED_DEV_DATA_DIR'), '/last')
    assert.equal(lastAssignment('OTHER=1\n', 'NESTLED_DEV_DATA_DIR'), undefined)

    const { main, worktree } = checkouts()
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR=/elsewhere\nNESTLED_DEV_DATA_DIR=\n')
    assert.equal(definesVariable(join(main, '.env'), 'NESTLED_DEV_DATA_DIR'), false)
    assert.deepEqual(devDockerSettings(worktree, {}).composeVariables, {
      NESTLED_DEV_DATA_DIR: join(main, '.dev', 'tmp'),
    })
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR=\nNESTLED_DEV_DATA_DIR=/elsewhere\n')
    assert.deepEqual(devDockerSettings(worktree, {}).composeVariables, {})
  })

  void it("skips assignment-looking lines inside another key's multi-line quoted value", () => {
    for (const quote of ['"', "'"]) {
      const contents = [
        'NESTLED_DEV_DATA_DIR=/actual',
        `NOTES=${quote}example`,
        'NESTLED_DEV_DATA_DIR=',
        `${quote}`,
        '',
      ].join('\n')
      assert.equal(lastAssignment(contents, 'NESTLED_DEV_DATA_DIR'), '/actual', quote)
    }
    assert.equal(
      lastAssignment(
        'NOTES="a \\" quote\nNESTLED_DEV_DATA_DIR=\n"\nNESTLED_DEV_DATA_DIR=/x\n',
        'NESTLED_DEV_DATA_DIR',
      ),
      '/x',
    )
    assert.throws(
      () => lastAssignment('NESTLED_DEV_DATA_DIR="/a\n/b"\n', 'NESTLED_DEV_DATA_DIR'),
      /spans lines/,
    )
  })

  void it('refuses an unquoted value that starts with #, which compose and dotenv read differently', () => {
    const { main, worktree } = checkouts()
    for (const line of ['NESTLED_DEV_DATA_DIR= # shared data', 'NESTLED_DEV_DATA_DIR=#x']) {
      writeFileSync(join(main, '.env'), `${line}\n`)
      assert.throws(() => devDockerSettings(worktree, {}), /starts with '#'/, line)
    }
    // Quoted, the value is unambiguous: an empty one is unset, a `#` inside quotes is kept.
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR="" # shared data\n')
    assert.equal(definesVariable(join(main, '.env'), 'NESTLED_DEV_DATA_DIR'), false)
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR="#data" # shared data\n')
    assert.equal(definesVariable(join(main, '.env'), 'NESTLED_DEV_DATA_DIR'), true)
  })
})

void describe('dev checkout resolution (scripts/dev-docker.sh)', () => {
  void it('runs a single checkout exactly as before', () => {
    const { main, bin } = checkouts()
    assert.deepEqual(withoutExported(devDocker(main, bin)), {
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
    assert.deepEqual(withoutExported(devDocker(worktree, bin)), {
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

  void it('drops an inherited empty value, so the .env decides the data directory', () => {
    const { main, worktree, bin } = checkouts()
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR=/elsewhere\n')
    // devDocker exports NESTLED_DEV_DATA_DIR='' by default: compose must not see that empty value,
    // since an exported variable outranks --env-file and would mask /elsewhere.
    assert.equal(devDocker(worktree, bin).exported, false)
    assert.equal(devDocker(main, bin).exported, false)
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
    assert.deepEqual(withoutExported(devDocker(outside, bin)), {
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
      `postgresql://postgres:postgres@localhost:55433/${testDatabaseName}`,
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

// A docker stub that records each call, reports `image` for `inspect`, and for `run` deletes what
// the throwaway container would (the folder mounted at /target), and a pnpm stub that records its
// arguments and the database URL it was given.
function recordingStubs(base, { image = 'postgres:16' } = {}) {
  const bin = join(base, 'recording-bin')
  const log = join(base, 'calls.log')
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(bin, 'docker'),
    [
      '#!/bin/bash',
      `printf 'docker %s\\n' "$*" >> '${log}'`,
      'case "$1" in',
      `  inspect) ${image ? `echo '${image}'` : 'exit 1'} ;;`,
      '  run)',
      '    for arg in "$@"; do',
      '      case "$arg" in *:/target) chmod -R u+w "${arg%:/target}"; find "${arg%:/target}" -mindepth 1 -delete ;; esac',
      '    done',
      '    ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  writeFileSync(
    join(bin, 'pnpm'),
    `#!/bin/bash\nprintf 'pnpm %s DATABASE_URL=%s\\n' "$*" "$DATABASE_URL" >> '${log}'\n`,
    { mode: 0o755 },
  )
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '')
  return { bin, calls }
}

function testDb(root, bin, command, env = {}) {
  const base = { ...process.env, NESTLED_DEV_DATA_DIR: '', PATH: `${bin}:${process.env.PATH}` }
  delete base.TEST_DATABASE_URL
  delete base.POSTGRES_TEST_PORT
  delete base.E2E_ALLOW_NON_DISPOSABLE_DB
  return spawnSync('bash', [join(root, 'scripts/test-db.sh'), command], {
    cwd: root,
    env: { ...base, ...env },
    encoding: 'utf8',
  })
}

void describe('scripts/test-db.sh reads .env as compose does, and acts only on what it can resolve', () => {
  void it('reads the last assignment and drops an unquoted inline comment', () => {
    const { main, bin } = checkouts()
    writeFileSync(
      join(main, '.env'),
      'POSTGRES_TEST_PORT=55433\nPOSTGRES_TEST_PORT=55444 # block 4\n',
    )
    const url = testDb(main, bin, 'url')
    assert.equal(url.status, 0, url.stderr)
    assert.match(url.stdout.trim(), /@localhost:55444\//)
  })

  void it('resets the data directory of the last assignment', () => {
    const { main, bin } = checkouts()
    const first = join(main, 'first-data')
    const last = join(main, 'last-data')
    writeFileSync(
      join(main, '.env'),
      `NESTLED_DEV_DATA_DIR=${first}\nNESTLED_DEV_DATA_DIR=${last}\n`,
    )
    mkdirSync(join(first, 'postgres-test'), { recursive: true })
    mkdirSync(join(last, 'postgres-test'), { recursive: true })
    const reset = testDb(main, bin, 'reset')
    assert.equal(reset.status, 0, reset.stderr)
    assert.equal(existsSync(join(last, 'postgres-test')), false)
    assert.equal(existsSync(join(first, 'postgres-test')), true)
  })

  void it('resets the folder compose mounts when a multi-line value holds an assignment-like line', () => {
    const { main, bin } = checkouts()
    const actual = join(main, 'actual-data')
    writeFileSync(
      join(main, '.env'),
      `NESTLED_DEV_DATA_DIR=${actual}\nNOTES='example\nNESTLED_DEV_DATA_DIR=\n'\n`,
    )
    mkdirSync(join(actual, 'postgres-test'), { recursive: true })
    mkdirSync(join(main, '.dev/tmp/postgres-test'), { recursive: true })
    const reset = testDb(main, bin, 'reset')
    assert.equal(reset.status, 0, reset.stderr)
    assert.equal(existsSync(join(actual, 'postgres-test')), false)
    assert.equal(existsSync(join(main, '.dev/tmp/postgres-test')), true)
  })

  void it('refuses a data directory whose quoted value spans lines', () => {
    const { main } = checkouts()
    const { bin, calls } = recordingStubs(main)
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR="/a\n/b"\n')
    const reset = testDb(main, bin, 'reset')
    assert.notEqual(reset.status, 0)
    assert.match(reset.stderr, /spans lines/)
    assert.equal(calls(), '')
  })

  void it('refuses an unquoted value that starts with #, before stopping anything', () => {
    const { main } = checkouts()
    const { bin, calls } = recordingStubs(main)
    mkdirSync(join(main, '.dev/tmp/postgres-test'), { recursive: true })
    for (const line of ['NESTLED_DEV_DATA_DIR= # shared data', 'POSTGRES_TEST_PORT=#55433']) {
      writeFileSync(join(main, '.env'), `${line}\n`)
      const reset = testDb(main, bin, 'reset')
      assert.notEqual(reset.status, 0, line)
      assert.match(reset.stderr, /starts with '#'/, line)
    }
    assert.equal(calls(), '')
    assert.equal(existsSync(join(main, '.dev/tmp/postgres-test')), true)
  })

  void it('refuses a value compose would interpolate, before stopping anything', () => {
    const { main } = checkouts()
    const { bin, calls } = recordingStubs(main)
    for (const line of [
      'NESTLED_DEV_DATA_DIR=${HOME}/data',
      'NESTLED_DEV_DATA_DIR="$HOME/data"',
      'POSTGRES_TEST_PORT=$PORT',
    ]) {
      writeFileSync(join(main, '.env'), `${line}\n`)
      const reset = testDb(main, bin, 'reset')
      assert.notEqual(reset.status, 0, line)
      assert.match(reset.stderr, /interpolates/, line)
    }
    assert.equal(calls(), '')
  })

  void it('takes a single-quoted $ literally, as compose does', () => {
    const { main, bin } = checkouts()
    const configured = join(main, 'data$literal')
    writeFileSync(join(main, '.env'), `NESTLED_DEV_DATA_DIR='${configured}'\n`)
    mkdirSync(join(configured, 'postgres-test'), { recursive: true })
    const reset = testDb(main, bin, 'reset')
    assert.equal(reset.status, 0, reset.stderr)
    assert.equal(existsSync(join(configured, 'postgres-test')), false)
  })

  void it('reports a missing data directory instead of claiming it was cleared', () => {
    const { main, bin } = checkouts()
    const reset = testDb(main, bin, 'reset')
    assert.equal(reset.status, 0, reset.stderr)
    assert.match(reset.stdout, /No data directory at .*postgres-test, so nothing was deleted/)
    assert.doesNotMatch(reset.stdout, /reset complete/)
  })

  void it('clears a data directory it cannot delete through a throwaway container', t => {
    if (process.getuid?.() === 0) {
      t.skip('root can delete the folder directly')
      return
    }
    const { main } = checkouts()
    const { bin, calls } = recordingStubs(main)
    const data = join(main, '.dev/tmp/postgres-test')
    mkdirSync(join(data, 'base'), { recursive: true })
    writeFileSync(join(data, 'base/file'), 'row')
    chmodSync(join(data, 'base'), 0o500)
    const reset = testDb(main, bin, 'reset')
    assert.equal(reset.status, 0, reset.stderr)
    assert.equal(existsSync(data), false)
    assert.ok(
      calls().includes(`docker run --rm -v ${data}:/target --entrypoint sh postgres:16`),
      calls(),
    )
    assert.match(reset.stdout, /reset complete/)
  })

  void it('says how to delete the folder when there is no image to clear it with', t => {
    if (process.getuid?.() === 0) {
      t.skip('root can delete the folder directly')
      return
    }
    const { main } = checkouts()
    const { bin } = recordingStubs(main, { image: '' })
    const data = join(main, '.dev/tmp/postgres-test')
    mkdirSync(join(data, 'base'), { recursive: true })
    writeFileSync(join(data, 'base/file'), 'row')
    chmodSync(join(data, 'base'), 0o500)
    try {
      const reset = testDb(main, bin, 'reset')
      assert.notEqual(reset.status, 0)
      assert.match(reset.stderr, /sudo rm -rf/)
    } finally {
      chmodSync(join(data, 'base'), 0o700)
    }
  })

  void it('migrates only a disposable test database', () => {
    const { main } = checkouts()
    const { bin, calls } = recordingStubs(main)
    const local = 'postgresql://postgres:postgres@localhost:55433/app_test'
    const ok = testDb(main, bin, 'migrate', { TEST_DATABASE_URL: local })
    assert.equal(ok.status, 0, ok.stderr)
    assert.ok(calls().includes(`pnpm prisma migrate deploy DATABASE_URL=${local}`), calls())

    for (const url of [
      'postgresql://postgres:postgres@db.example.com:5432/app_test',
      'postgresql://postgres:postgres@localhost:5432/app',
    ]) {
      const refused = testDb(main, bin, 'migrate', { TEST_DATABASE_URL: url })
      assert.notEqual(refused.status, 0, url)
      assert.match(refused.stderr, /Refusing to migrate/, url)
      const allowed = testDb(main, bin, 'migrate', {
        TEST_DATABASE_URL: url,
        E2E_ALLOW_NON_DISPOSABLE_DB: '1',
      })
      assert.equal(allowed.status, 0, allowed.stderr)
    }
    for (const url of [
      'postgresql://postgres:postgres@localhost:5432/app_test?host=db.example.com',
      'postgresql://postgres:postgres@localhost:5432/app_test#x',
      'mysql://root@localhost:3306/app_test',
    ]) {
      const refused = testDb(main, bin, 'migrate', {
        TEST_DATABASE_URL: url,
        E2E_ALLOW_NON_DISPOSABLE_DB: '1',
      })
      assert.notEqual(refused.status, 0, url)
      assert.match(refused.stderr, /not a plain postgresql:\/\/ URL/, url)
    }
    assert.equal(calls().match(/prisma migrate deploy/g)?.length, 3)
  })
})

void describe('scripts/dev-docker.sh reads .env as compose does', () => {
  void it('honours the last assignment of the data directory', () => {
    const { main, worktree, bin } = checkouts()
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR=/elsewhere\nNESTLED_DEV_DATA_DIR=\n')
    assert.equal(devDocker(worktree, bin).data, `${main}/.dev/tmp`)
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR=\nNESTLED_DEV_DATA_DIR=/elsewhere\n')
    assert.equal(devDocker(worktree, bin).data, '')
  })

  void it('refuses an unquoted data directory that starts with #', () => {
    const { main, worktree, bin } = checkouts()
    writeFileSync(join(main, '.env'), 'NESTLED_DEV_DATA_DIR= # shared data\n')
    const result = spawnSync('bash', [join(worktree, 'scripts/dev-docker.sh'), 'config'], {
      cwd: worktree,
      env: { ...process.env, NESTLED_DEV_DATA_DIR: '', PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /starts with '#'/)
    assert.equal(result.stdout, '')
  })
})
