import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const compose = parse(readFileSync(join(root, '.dev/docker-compose.yml'), 'utf8'))
const services = Object.entries(compose.services ?? {})

describe('.dev/docker-compose.yml', () => {
  it('has services to check', () => {
    assert.ok(services.length > 0)
  })

  // A service without a restart policy stays down after the machine or Docker restarts, while the
  // others come back: the app then fails on its first Redis call, not at start.
  for (const [name, service] of services) {
    it(`${name} comes back after a restart of the machine or of Docker`, () => {
      assert.equal(service.restart, 'unless-stopped')
    })

    it(`${name} publishes its ports on 127.0.0.1 only`, () => {
      for (const port of service.ports ?? []) {
        assert.match(String(port), /^127\.0\.0\.1:/, `${name}: ${port}`)
      }
    })
  }
})
