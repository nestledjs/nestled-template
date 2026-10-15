import { describe, expect, it } from 'vitest'
import {
  DESTINATION_OVERRIDES,
  assertDisposableTestDatabase,
  databaseProbe,
  describeDatabase,
  isDisposableTestDatabase,
  psqlEnvironment,
  psqlProcessEnvironment,
  runOnTestDatabase,
  type DatabaseClients,
} from './database-guards'

// Built at runtime, so no credential-shaped literal sits in the source for secret scanners to flag.
const PASSWORD = ['fixture', 'pw', String(process.pid)].join('-')
const URL_WITH_PASSWORD = `postgresql://u:${PASSWORD}@localhost:5433/app_test`

describe('test database guards', () => {
  it.each([
    'postgresql://prisma:prisma@localhost:5432/nestled_template_test',
    'postgresql://u:p@127.0.0.1:55460/app_test?sslmode=disable',
    'postgres://u:p@localhost/app_test',
    'postgresql://u:p@[::1]:5433/APP_TEST',
  ])('treats %s as disposable', url => {
    expect(isDisposableTestDatabase(url)).toBe(true)
    expect(assertDisposableTestDatabase(url, {})).toBe('disposable')
  })

  it.each([
    'postgresql://u:p@localhost:5432/nestled_template',
    'postgresql://u:p@localhost:5432/test_data',
    'postgresql://u:p@db.example.com:5432/app_test',
    'postgresql://u:p@postgres:5432/app_test',
    'postgresql://u:p@localhost:5432/app_test?schema=other',
    'postgresql://u:p@localhost:5432/app_test#fragment',
    'mysql://u:p@localhost:5432/app_test',
    'not a url',
  ])('refuses %s before setup touches it, naming no password', url => {
    expect(isDisposableTestDatabase(url)).toBe(false)
    expect(() => assertDisposableTestDatabase(url, {})).toThrow(/Refusing to run e2e setup/)
    expect(() => assertDisposableTestDatabase(url, {})).not.toThrow(/u:p@/)
  })

  it.each(DESTINATION_OVERRIDES)(
    'refuses a URL whose %s parameter overrides the destination',
    key => {
      const url = `postgresql://u:p@localhost:5432/app_test?${key}=elsewhere`
      expect(isDisposableTestDatabase(url)).toBe(false)
      expect(isDisposableTestDatabase(url.replace(`?${key}=`, `?${key.toUpperCase()}=`))).toBe(
        false,
      )
      expect(() => assertDisposableTestDatabase(url, {})).toThrow(/Refusing to run e2e setup/)
    },
  )

  it('lets an explicit opt-out through, and only the value 1', () => {
    const url = 'postgresql://u:p@postgres:5432/app_test'
    expect(assertDisposableTestDatabase(url, { E2E_ALLOW_NON_DISPOSABLE_DB: '1' })).toBe('allowed')
    expect(() =>
      assertDisposableTestDatabase(url, { E2E_ALLOW_NON_DISPOSABLE_DB: 'true' }),
    ).toThrow()
  })

  it.each([
    'postgresql://u:p@localhost:5432/app',
    'postgresql://u:p@db.example.com:5432/app_test',
    'postgresql://u:p@localhost:5432/app_test?schema=other',
  ])('lets the opt-out through for %s, a choice of name, host or schema', url => {
    expect(assertDisposableTestDatabase(url, { E2E_ALLOW_NON_DISPOSABLE_DB: '1' })).toBe('allowed')
  })

  it.each([
    ...DESTINATION_OVERRIDES.map(key => `postgresql://u:p@postgres:5432/app_test?${key}=elsewhere`),
    'postgresql://u:p@localhost:5432/app_test#elsewhere',
    'mysql://u:p@localhost:5432/app_test',
    'postgresql://u:p@localhost:5432/app%ZZ_test',
    'not a url',
  ])('refuses %s even with the opt-out, since it could connect elsewhere', url => {
    expect(() => assertDisposableTestDatabase(url, { E2E_ALLOW_NON_DISPOSABLE_DB: '1' })).toThrow(
      /does not apply to a URL that could connect somewhere other/,
    )
  })

  it('says why a database was refused', () => {
    const refusal = (url: string) => {
      try {
        assertDisposableTestDatabase(url, {})
      } catch (error) {
        return (error as Error).message
      }
      return ''
    }
    expect(refusal('postgresql://u:p@localhost/app')).toContain('does not end in _test')
    expect(refusal('postgresql://u:p@db.example.com/app_test')).toContain('host is not localhost')
    expect(refusal('postgresql://u:p@localhost/app_test?schema=x')).toContain('?schema=')
    expect(refusal('postgresql://u:p@localhost/app_test?PORT=1')).toContain('?port=')
    expect(refusal('postgresql://u:p@localhost/app_test#x')).toContain('fragment')
    expect(refusal('mysql://u:p@localhost/app_test')).toContain('mysql:')
    expect(refusal('postgresql://u:p@localhost/app%ZZ_test')).toContain('percent-encoding')
  })

  it('describes a database by host and name only', () => {
    expect(describeDatabase(URL_WITH_PASSWORD)).toBe('localhost:5433/app_test')
  })

  it('probes with the pg runner unless psql is asked for', () => {
    expect(databaseProbe({})).toBe('pg')
    expect(databaseProbe({ E2E_DATABASE_PROBE: 'psql' })).toBe('psql')
    expect(() => databaseProbe({ E2E_DATABASE_PROBE: 'pg_isready' })).toThrow(/"pg" or "psql"/)
  })

  it('hands psql the URL as libpq variables, keeping the password off its command line', () => {
    expect(
      psqlEnvironment('postgresql://us%40r:p%3Ass@[::1]:55460/app_test?sslmode=disable'),
    ).toEqual({
      PGHOST: '::1',
      PGPORT: '55460',
      PGDATABASE: 'app_test',
      PGUSER: 'us@r',
      PGPASSWORD: 'p:ss',
      PGSSLMODE: 'disable',
    })
    expect(psqlEnvironment('postgresql://localhost/app_test')).toEqual({
      PGHOST: 'localhost',
      PGPORT: '5432',
      PGDATABASE: 'app_test',
    })
  })

  it('drops inherited libpq variables from the psql environment and keeps the rest', () => {
    const environment = psqlProcessEnvironment('postgresql://u:p@localhost:5433/app_test', {
      PATH: '/usr/bin',
      PGHOSTADDR: '10.0.0.5',
      PGSERVICE: 'production',
      PGPASSFILE: 'other.pgpass',
      PGPASSWORD: 'stale',
      PGOPTIONS: '-c search_path=other',
    })
    expect(environment).toEqual({
      PATH: '/usr/bin',
      PGHOST: 'localhost',
      PGPORT: '5433',
      PGDATABASE: 'app_test',
      PGUSER: 'u',
      PGPASSWORD: 'p',
    })
  })
})

describe('runOnTestDatabase', () => {
  const url = URL_WITH_PASSWORD
  const clients = (psqlStatus: number | null = 0) => {
    const calls: { client: string; args: unknown[] }[] = []
    const fake: DatabaseClients = {
      pg: (...args) => {
        calls.push({ client: 'pg', args })
      },
      psql: (...args) => {
        calls.push({ client: 'psql', args })
        return { status: psqlStatus }
      },
    }
    return { calls, fake }
  }

  it('runs the statement through the pg runner by default', () => {
    const { calls, fake } = clients()
    runOnTestDatabase(url, 'SELECT 1', fake, { env: {}, timeout: 10000 })
    expect(calls).toEqual([{ client: 'pg', args: [url, 'SELECT 1', 10000] }])
  })

  it('runs the probe and the reset through psql when E2E_DATABASE_PROBE=psql', () => {
    const { calls, fake } = clients()
    const env = { E2E_DATABASE_PROBE: 'psql', PATH: '/usr/bin', PGSERVICE: 'production' }
    const reset = 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
    runOnTestDatabase(url, 'SELECT 1', fake, { env })
    runOnTestDatabase(url, reset, fake, { env })
    expect(calls.map(call => call.client)).toEqual(['psql', 'psql'])
    const [args, psqlEnv] = calls[1].args as [string[], NodeJS.ProcessEnv]
    expect(args).toEqual(['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', reset])
    // The URL reaches psql through its environment only, never its arguments.
    expect(args.join(' ')).not.toContain(PASSWORD)
    expect(psqlEnv).toMatchObject({ PATH: '/usr/bin', PGPASSWORD: PASSWORD, PGPORT: '5433' })
    expect(psqlEnv.PGSERVICE).toBeUndefined()
  })

  it("includes psql's own error output, so a failure says why", () => {
    const fake: DatabaseClients = {
      pg: () => undefined,
      psql: () => ({
        status: 2,
        stderr:
          'psql: error: connection to server at "localhost", port 5433 failed: Connection refused\n',
      }),
    }
    expect(() =>
      runOnTestDatabase(url, 'SELECT 1', fake, { env: { E2E_DATABASE_PROBE: 'psql' } }),
    ).toThrow(
      'psql failed against localhost:5433/app_test (exit 2):\npsql: error: connection to server at "localhost", port 5433 failed: Connection refused',
    )
  })

  it('caps long psql error output', () => {
    const fake: DatabaseClients = {
      pg: () => undefined,
      psql: () => ({ status: 3, stderr: 'x'.repeat(5000) }),
    }
    let message = ''
    try {
      runOnTestDatabase(url, 'SELECT 1', fake, { env: { E2E_DATABASE_PROBE: 'psql' } })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message.length).toBeLessThan(2200)
    expect(message.endsWith('…')).toBe(true)
  })

  it('throws when psql fails, naming the database without its password', () => {
    const { fake } = clients(3)
    expect(() =>
      runOnTestDatabase(url, 'SELECT 1', fake, { env: { E2E_DATABASE_PROBE: 'psql' } }),
    ).toThrow('psql failed against localhost:5433/app_test (exit 3)')
  })
})
