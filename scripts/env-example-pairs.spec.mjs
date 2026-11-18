import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const example = readFileSync(join(root, '.env.example'), 'utf8')

/** The value an uncommented `KEY=value` line in .env.example sets, or undefined. */
function value(key) {
  return new RegExp(`^${key}=(.*)$`, 'm').exec(example)?.[1].trim()
}

/**
 * `cp .env.example .env` must give a working, consistent setup. A port shipped set while its URL
 * partner is commented out is a half-moved pair: the doctor's dev-ports check flags it as soon as
 * the port moves, and the URL a tool reads falls back to a default on the old port.
 */
describe('.env.example port pairs', () => {
  for (const [portKey, urlKey] of [
    ['POSTGRES_PORT', 'DATABASE_URL'],
    ['POSTGRES_TEST_PORT', 'TEST_DATABASE_URL'],
  ]) {
    it(`sets ${urlKey} on the port ${portKey} sets`, () => {
      const port = value(portKey)
      const url = value(urlKey)
      assert.ok(port, `${portKey} is not set`)
      assert.ok(url, `${urlKey} is not set (commented out?) while ${portKey} is`)
      assert.equal(new URL(url).port, port)
    })
  }

  it("ships TEST_DATABASE_URL as the URL test-db.sh builds for the repo's own test database", () => {
    const script = readFileSync(join(root, 'scripts/test-db.sh'), 'utf8')
    const own = /^TEST_DB_OWN_URL="(.*)"$/m.exec(script)?.[1]
    assert.ok(own, 'test-db.sh defines TEST_DB_OWN_URL')
    assert.equal(
      value('TEST_DATABASE_URL'),
      own.replace('${TEST_DB_PORT}', value('POSTGRES_TEST_PORT')),
    )
  })

  it('describes no connection pooler, which the Railway setup no longer has', () => {
    assert.doesNotMatch(example, /pgbouncer|6432/i)
  })
})
