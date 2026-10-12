import { describe, expect, it } from 'vitest'
import { formatRows, prepareStatements } from './sql-runner.mjs'

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
