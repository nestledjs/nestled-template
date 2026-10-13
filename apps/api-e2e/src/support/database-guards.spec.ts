import { describe, expect, it } from 'vitest'
import {
  assertDisposableTestDatabase,
  databaseProbe,
  describeDatabase,
  isDisposableTestDatabase,
  psqlEnvironment,
} from './database-guards'

describe('test database guards', () => {
  it.each([
    'postgresql://prisma:prisma@localhost:5432/nestled_template_test',
    'postgresql://u:p@127.0.0.1:55460/app_test?schema=public',
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
    'not a url',
  ])('refuses %s before setup touches it, naming no password', url => {
    expect(isDisposableTestDatabase(url)).toBe(false)
    expect(() => assertDisposableTestDatabase(url, {})).toThrow(/Refusing to run e2e setup/)
    expect(() => assertDisposableTestDatabase(url, {})).not.toThrow(/u:p@/)
  })

  it('lets an explicit opt-out through, and only the value 1', () => {
    const url = 'postgresql://u:p@postgres:5432/app_test'
    expect(assertDisposableTestDatabase(url, { E2E_ALLOW_NON_DISPOSABLE_DB: '1' })).toBe('allowed')
    expect(() =>
      assertDisposableTestDatabase(url, { E2E_ALLOW_NON_DISPOSABLE_DB: 'true' }),
    ).toThrow()
  })

  it('describes a database by host and name only', () => {
    expect(describeDatabase('postgresql://u:secret@localhost:5433/app_test')).toBe(
      'localhost:5433/app_test',
    )
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
})
