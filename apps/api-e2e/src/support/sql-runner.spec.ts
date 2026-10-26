import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { errorReason, formatRows, prepareStatements, scrubCredentials } from './sql-runner.mjs'

// Built at runtime, so the fixture is not a credential-shaped literal in the source.
const PASSWORD = ['fixture', 'pw', String(process.pid)].join('-')

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

describe('sql runner', () => {
  it('splits a script at top-level semicolons, as psql runs it', () => {
    expect(prepareStatements('SELECT 1; UPDATE t SET a = 2 ;\n SELECT 3;', {}, quote)).toEqual([
      'SELECT 1',
      'UPDATE t SET a = 2',
      'SELECT 3',
    ])
  })

  it('substitutes :name variables as quoted literals', () => {
    expect(
      prepareStatements(
        `SELECT id FROM "User" WHERE id = :'id' AND x::text = :'x';`,
        {
          id: "it's",
          x: 'y',
        },
        quote,
      ),
    ).toEqual([`SELECT id FROM "User" WHERE id = 'it''s' AND x::text = 'y'`])
  })

  it('leaves strings, identifiers, comments and dollar-quoted bodies untouched', () => {
    const script = [
      `SELECT ';:''id''', "a;b" -- not; :'id'`,
      `/* ; :'id' */ FROM t;`,
      `CREATE FUNCTION f() RETURNS trigger AS $body$ BEGIN PERFORM 1; RETURN NULL; END; $body$ LANGUAGE plpgsql;`,
      `DO $$ BEGIN PERFORM 2; END $$`,
    ].join('\n')
    expect(prepareStatements(script, {}, quote)).toEqual([
      `SELECT ';:''id''', "a;b" -- not; :'id'\n/* ; :'id' */ FROM t`,
      'CREATE FUNCTION f() RETURNS trigger AS $body$ BEGIN PERFORM 1; RETURN NULL; END; $body$ LANGUAGE plpgsql',
      'DO $$ BEGIN PERFORM 2; END $$',
    ])
  })

  it('keeps a backslash-escaped quote inside an escape string', () => {
    expect(prepareStatements(`SELECT E'it\\'s; fine', e'a\\\\'; SELECT 'b\\';`, {}, quote)).toEqual(
      [`SELECT E'it\\'s; fine', e'a\\\\'`, `SELECT 'b\\'`],
    )
  })

  it('does not open a dollar quote at a $ inside an identifier', () => {
    expect(
      prepareStatements('SELECT price$usd$ FROM t; SELECT $$ a; b $$, $1 FROM u;', {}, quote),
    ).toEqual(['SELECT price$usd$ FROM t', 'SELECT $$ a; b $$, $1 FROM u'])
  })

  it('treats a $ after a non-ASCII identifier character as part of the identifier', () => {
    expect(prepareStatements('SELECT café$usd$ FROM t; SELECT 1;', {}, quote)).toEqual([
      'SELECT café$usd$ FROM t',
      'SELECT 1',
    ])
  })

  it('keeps a dollar-quoted body whose tag has non-ASCII letters in one statement', () => {
    expect(
      prepareStatements(
        'DO $café$ BEGIN PERFORM 1; PERFORM 2; END $café$; SELECT $ü1$ a; b $ü1$;',
        {},
        quote,
      ),
    ).toEqual(['DO $café$ BEGIN PERFORM 1; PERFORM 2; END $café$', 'SELECT $ü1$ a; b $ü1$'])
  })

  it('ends a nested block comment at the marker that balances its opener', () => {
    expect(
      prepareStatements(`SELECT 1 /* a /* b; :'x' */ c; */; SELECT 2 /* open`, {}, quote),
    ).toEqual([`SELECT 1 /* a /* b; :'x' */ c; */`, 'SELECT 2 /* open'])
  })

  it('refuses a variable that was not supplied', () => {
    expect(() => prepareStatements(`SELECT :'missing'`, {}, quote)).toThrow(/:'missing'/)
  })

  it('formats rows like psql -At and prints nothing for a statement without columns', () => {
    expect(
      formatRows({
        fields: [{}, {}, {}],
        rows: [
          ['1', 't', null],
          ['2', 'f', 'x|y'],
        ],
      }),
    ).toEqual(['1|t|', '2|f|x|y'])
    expect(formatRows({ fields: [], rows: [] })).toEqual([])
  })
})

describe('sql runner errors', () => {
  it('drop the URL, its user-info and its password, raw and percent-decoded', () => {
    const url = `postgresql://app:${PASSWORD}%21@localhost:55433/app_test`
    const message = `failed ${url}; app:${PASSWORD}%21; ${PASSWORD}!; postgres://u:p@elsewhere/db`
    const scrubbed = scrubCredentials(message, url)
    expect(scrubbed).not.toContain(PASSWORD)
    expect(scrubbed).not.toContain(url)
    expect(scrubbed).toContain('postgres://***@elsewhere/db')
  })

  it('keep a message with no credential as it is', () => {
    expect(scrubCredentials('connect ECONNREFUSED 127.0.0.1:1', undefined)).toBe(
      'connect ECONNREFUSED 127.0.0.1:1',
    )
  })

  it('name the reason for a refused connection, whose own message is empty', () => {
    const refusal = Object.assign(
      new AggregateError(
        [new Error('connect ECONNREFUSED ::1:1'), new Error('connect ECONNREFUSED 127.0.0.1:1')],
        '',
      ),
      { code: 'ECONNREFUSED' },
    )
    expect(errorReason(refusal)).toBe(
      'connect ECONNREFUSED ::1:1; connect ECONNREFUSED 127.0.0.1:1',
    )
    expect(errorReason(Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' }))).toBe(
      'ECONNREFUSED',
    )
    expect(errorReason(new Error('password authentication failed'))).toBe(
      'password authentication failed',
    )
    expect(errorReason('plain')).toBe('plain')
    expect(errorReason({ code: 'E1' })).toBe('{"code":"E1"}')
    expect(errorReason(null)).toBe('unknown error')
    expect(errorReason(new AggregateError(['a', null, { b: 1 }], ''))).toBe('a; {"b":1}')
  })

  it('reach stderr scrubbed when the database cannot be reached', () => {
    const url = `postgresql://app:${PASSWORD}@127.0.0.1:1/app_test`
    const result = spawnSync(process.execPath, [resolve(__dirname, 'sql-runner.mjs')], {
      input: JSON.stringify({ url, statement: 'SELECT 1' }),
      encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).not.toBe('')
    expect(result.stderr).toMatch(/ECONNREFUSED/)
    expect(result.stderr).not.toContain(PASSWORD)
  })
})
