import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  creatableTestDatabase,
  dropUserInfo,
  ensureTestDatabase,
  errorReason,
  main,
  scrubCredentials,
} from './test-database.mjs'

// Built at runtime, so the fixture is not a credential-shaped literal in the source.
const PASSWORD = ['fixture', 'pw', String(process.pid)].join('-')
const withPassword = (rest, password = PASSWORD) => `postgresql://app:${password}@${rest}`
const LOCAL_URL = withPassword('localhost:55433/app_test')

// A server that records what it was asked. `databases` are the names pg_database holds;
// `missing` are databases a connection to fails with 3D000.
function fakeServer({ databases = [], missing = [], createError } = {}) {
  const connections = []
  const statements = []
  const connect = async connectionString => {
    connections.push(connectionString)
    const name = new URL(connectionString).pathname.slice(1)
    if (missing.includes(name)) {
      throw Object.assign(new Error(`database "${name}" does not exist`), { code: '3D000' })
    }
    return {
      query: async (text, values) => {
        statements.push(values ? `${text} ${JSON.stringify(values)}` : text)
        if (text.startsWith('SELECT')) {
          return { rowCount: databases.includes(values?.[0]) ? 1 : 0 }
        }
        if (createError) throw createError
        return { rowCount: null }
      },
      end: async () => undefined,
    }
  }
  return { connect, connections, statements }
}

void describe('creatableTestDatabase', () => {
  void it('accepts a plain local *_test URL and names its maintenance URL on the same server', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const { database, maintenanceUrl } = creatableTestDatabase(
        withPassword(`${host}:5433/App_TEST`),
      )
      assert.equal(database, 'App_TEST')
      assert.equal(maintenanceUrl('postgres'), withPassword(`${host}:5433/postgres`))
    }
    assert.equal(creatableTestDatabase('postgres://localhost/app_test').database, 'app_test')
  })

  void it('refuses anything that is not plainly a local test database, without echoing it', () => {
    for (const url of [
      withPassword('db.example.com:5432/app_test'),
      withPassword('localhost:5432/app'),
      withPassword('localhost:5432/app_test?host=db.example.com'),
      withPassword('localhost:5432/app_test#x'),
      withPassword('localhost:5432/app$x_test'),
      withPassword('localhost:5432/app"x_test'),
      withPassword(`localhost:5432/${'a'.repeat(60)}_test`),
      `mysql://root:${PASSWORD}@localhost:3306/app_test`,
      'not a url',
    ]) {
      assert.throws(
        () => creatableTestDatabase(url),
        error => !error.message.includes(PASSWORD) && !error.message.includes(url),
        url,
      )
    }
  })
})

void describe('ensureTestDatabase', () => {
  void it('creates the database when the server does not have it', async () => {
    const server = fakeServer({ databases: ['postgres'] })
    assert.equal(await ensureTestDatabase(LOCAL_URL, server), 'created')
    assert.deepEqual(server.connections, [withPassword('localhost:55433/postgres')])
    assert.deepEqual(server.statements, [
      'SELECT 1 FROM pg_database WHERE datname = $1 ["app_test"]',
      'CREATE DATABASE "app_test"',
    ])
  })

  void it('leaves an existing database alone', async () => {
    const server = fakeServer({ databases: ['app_test'] })
    assert.equal(await ensureTestDatabase(LOCAL_URL, server), 'exists')
    assert.equal(server.statements.length, 1)
  })

  void it('treats a database another run created meanwhile as existing', async () => {
    const duplicate = Object.assign(new Error('already exists'), { code: '42P04' })
    const server = fakeServer({ createError: duplicate })
    assert.equal(await ensureTestDatabase(LOCAL_URL, server), 'exists')
  })

  void it('falls back to template1 when the server has no postgres database', async () => {
    const server = fakeServer({ missing: ['postgres'] })
    assert.equal(await ensureTestDatabase(LOCAL_URL, server), 'created')
    assert.deepEqual(server.connections, [
      withPassword('localhost:55433/postgres'),
      withPassword('localhost:55433/template1'),
    ])
  })

  void it('reports a refused CREATE DATABASE', async () => {
    const denied = Object.assign(new Error('permission denied to create database'), {
      code: '42501',
    })
    await assert.rejects(ensureTestDatabase(LOCAL_URL, fakeServer({ createError: denied })), {
      message: 'permission denied to create database',
    })
  })

  void it('never connects for a URL it refuses', async () => {
    const server = fakeServer()
    for (const url of [
      withPassword('db.example.com:5432/app_test'),
      withPassword('localhost:5432/app'),
    ]) {
      await assert.rejects(ensureTestDatabase(url, server))
    }
    assert.deepEqual(server.connections, [])
  })
})

void describe('scrubCredentials', () => {
  void it('removes the URL, its user-info and its password, raw and decoded', () => {
    const encoded = `${PASSWORD}%40x`
    const url = withPassword('localhost:5433/app_test', encoded)
    const text = `failed: ${url} / app:${encoded} / ${PASSWORD}@x / postgres://u:${PASSWORD}@h/db`
    const scrubbed = scrubCredentials(text, url)
    assert.ok(!scrubbed.includes(PASSWORD), scrubbed)
    assert.ok(!scrubbed.includes(url), scrubbed)
    assert.match(scrubbed, /^failed: \*\*\* /)
    assert.match(scrubbed, /postgres:\/\/\*\*\*@h\/db$/)
  })

  void it('keeps a message that carries no credential', () => {
    assert.equal(
      scrubCredentials('connect ECONNREFUSED 127.0.0.1:55433', LOCAL_URL),
      'connect ECONNREFUSED 127.0.0.1:55433',
    )
  })
})

void describe('dropUserInfo', () => {
  void it('replaces the user-info of every URL and leaves everything else', () => {
    assert.equal(
      dropUserInfo('a postgres://u:p@h/db b https://x@y/z c http://host/path d://@e'),
      'a postgres://***@h/db b https://***@y/z c http://host/path d://@e',
    )
    assert.equal(dropUserInfo('no url here'), 'no url here')
  })

  void it('stays fast on a long message with no @', () => {
    const long = `x://${'a:'.repeat(200000)}`
    const started = process.hrtime.bigint()
    assert.equal(dropUserInfo(long), long)
    assert.ok(process.hrtime.bigint() - started < 1_000_000_000n)
  })
})

void describe('test-database.mjs ensure', () => {
  const run = async (args, env, server) => {
    const out = []
    const err = []
    const status = await main(args, env, {
      connect: server?.connect,
      write: line => out.push(line),
      writeError: line => err.push(line),
    })
    return { status, out: out.join('\n'), err: err.join('\n') }
  }

  void it('says what it did', async () => {
    const created = await run(['ensure'], { TEST_DATABASE_URL: LOCAL_URL }, fakeServer())
    assert.equal(created.status, 0)
    assert.equal(created.out, '✅ Created the test database app_test')
    const exists = await run(
      ['ensure'],
      { TEST_DATABASE_URL: LOCAL_URL },
      fakeServer({ databases: ['app_test'] }),
    )
    assert.equal(exists.out, '✅ The test database app_test exists')
  })

  void it('fails with a scrubbed reason, never the URL or its password', async () => {
    const leaky = Object.assign(new Error(`could not connect to ${LOCAL_URL} as app:${PASSWORD}`), {
      code: '08006',
    })
    const failing = {
      connect: async () => {
        throw leaky
      },
    }
    const failed = await run(['ensure'], { TEST_DATABASE_URL: LOCAL_URL }, failing)
    assert.equal(failed.status, 1)
    assert.match(failed.err, /Could not ensure the test database/)
    assert.ok(!failed.err.includes(PASSWORD), failed.err)
    assert.ok(!failed.err.includes(LOCAL_URL), failed.err)

    const refused = await run(['ensure'], {
      TEST_DATABASE_URL: withPassword('db.example.com:5432/app_test'),
    })
    assert.equal(refused.status, 1)
    assert.match(refused.err, /host is not localhost/)
    assert.ok(!refused.err.includes(PASSWORD), refused.err)
  })

  void it('names the reason for a refused connection, whose own message is empty', async () => {
    const refusal = Object.assign(
      new AggregateError(
        [
          Object.assign(new Error('connect ECONNREFUSED ::1:55433'), { code: 'ECONNREFUSED' }),
          Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:55433'), {
            code: 'ECONNREFUSED',
          }),
        ],
        '',
      ),
      { code: 'ECONNREFUSED' },
    )
    const failed = await run(
      ['ensure'],
      { TEST_DATABASE_URL: LOCAL_URL },
      {
        connect: async () => {
          throw refusal
        },
      },
    )
    assert.equal(failed.status, 1)
    assert.equal(
      failed.err,
      '❌ Could not ensure the test database: connect ECONNREFUSED ::1:55433; ' +
        'connect ECONNREFUSED 127.0.0.1:55433',
    )
  })

  void it('needs the ensure command and a URL', async () => {
    assert.equal((await run([], { TEST_DATABASE_URL: LOCAL_URL })).status, 2)
    assert.equal((await run(['ensure'], {})).status, 2)
  })
})

void describe('errorReason', () => {
  void it('prefers the message, then the nested messages, then the code', () => {
    assert.equal(errorReason(new Error('boom')), 'boom')
    const nested = new AggregateError([new Error('a'), new Error('a'), new Error('b')], '')
    assert.equal(errorReason(nested), 'a; b')
    assert.equal(
      errorReason(Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' })),
      'ECONNREFUSED',
    )
    assert.equal(errorReason(Object.assign(new Error(''), { code: 'ETIMEDOUT' })), 'ETIMEDOUT')
    assert.equal(errorReason(new Error('')), 'Error')
    assert.equal(errorReason('plain'), 'plain')
  })
})
