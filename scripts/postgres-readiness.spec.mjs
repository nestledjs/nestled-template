import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every `pg_isready` probe the workspace waits on asks over TCP, not the Unix socket.
 *
 * On a fresh data directory (every CI run, every first local start) the postgres image's
 * entrypoint runs `initdb`, starts a TEMPORARY server to execute `/docker-entrypoint-initdb.d`,
 * stops it, and only then starts the server that stays. The temporary server gets
 * `-c listen_addresses=''`: it answers on the socket and nowhere else. A socket probe therefore
 * succeeds for a server about to shut down, and whatever runs next races it:
 *
 *   createdb: error: connection to server on socket "…/.s.PGSQL.5432" failed:
 *             FATAL:  the database system is shutting down
 *
 * That turned the generated-artifacts job red intermittently. A source-shape check rather than a
 * behavioural one: the probes talk to a Docker daemon, and `db-update.mjs` runs on import.
 */
const PROBED_FILES = ['scripts/db-update.mjs', 'scripts/test-db.sh', '.dev/docker-compose.yml']

/** Each `pg_isready` in `source`, with the text that follows it, up to the next one. */
function readinessProbes(source) {
  const probes = []
  const pattern = /pg_isready/g
  let match = pattern.exec(source)
  while (match !== null) {
    const next = source.indexOf('pg_isready', match.index + 1)
    const end = next === -1 ? source.length : next
    probes.push(source.slice(match.index, Math.min(end, match.index + 300)))
    match = pattern.exec(source)
  }
  return probes
}

function asksOverTcp(probe) {
  return /-h['",\s]+127\.0\.0\.1/.test(probe)
}

describe('Postgres readiness probes', () => {
  for (const file of PROBED_FILES) {
    it(`${file} waits on the lasting server over TCP, not the init socket`, () => {
      const probes = readinessProbes(readFileSync(join(root, file), 'utf8'))

      assert.ok(probes.length > 0, `${file} has no pg_isready probe to check`)
      for (const probe of probes) {
        assert.ok(
          asksOverTcp(probe),
          `${file}: a pg_isready probe does not pass -h 127.0.0.1, so it asks over the Unix ` +
            `socket and can answer for the temporary initdb server:\n${probe.slice(0, 80)}`,
        )
      }
    })
  }

  it('fails a socket-only probe', () => {
    const probes = readinessProbes('docker exec "$C" pg_isready -U postgres > /dev/null')

    assert.equal(probes.length, 1)
    assert.equal(asksOverTcp(probes[0]), false)
  })

  it('reads each probe separately rather than letting one cover the next', () => {
    const probes = readinessProbes(
      'pg_isready -h 127.0.0.1 -U a\n' + 'x'.repeat(400) + '\npg_isready -U b\n',
    )

    assert.equal(probes.length, 2)
    assert.equal(asksOverTcp(probes[0]), true)
    assert.equal(asksOverTcp(probes[1]), false)
  })

  it('accepts the argv form db-update.mjs uses', () => {
    assert.equal(asksOverTcp("'pg_isready',\n      '-h',\n      '127.0.0.1',"), true)
  })
})
