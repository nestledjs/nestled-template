// @ts-check
// Runs SQL against a PostgreSQL URL with the `pg` client and prints the rows the way `psql -At` does
// (columns joined by `|`, NULL as empty, one row per line, the server's text form of every value), so
// the e2e helpers need no psql binary. Statements are split at top-level semicolons and run one at a
// time with autocommit, as psql runs a script; the first error stops the script.
//
// Usage: node sql-runner.mjs < {"url": "...", "statement": "...", "variables": {"name": "value"}}
// The request arrives on stdin, so the URL and its password never appear in a process listing.
// `:'name'` in the statement is replaced by the variable's value as a quoted literal.

import pg from 'pg'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Split a script into statements, replacing `:'name'` with `quote(variables[name])`. Quoted strings
 * (escape strings E'...' included), quoted identifiers, dollar-quoted bodies and comments are copied
 * untouched, and a `$` inside an identifier does not open a dollar quote. Nested block comments, which
 * PostgreSQL allows, are not tracked: one ends at its first closing marker, so keep them out of e2e
 * SQL.
 *
 * @param {string} script
 * @param {Record<string, string>} variables
 * @param {(value: string) => string} quote
 * @returns {string[]}
 */
export function prepareStatements(script, variables, quote) {
  const isWordChar = (/** @type {string | undefined} */ char) =>
    char !== undefined && /[\w$]/.test(char)
  const statements = []
  let current = ''
  let i = 0
  const copyUntil = (/** @type {number} */ end) => {
    current += script.slice(i, end)
    i = end
  }
  while (i < script.length) {
    const rest = script.slice(i)
    if (rest.startsWith('--')) {
      const end = script.indexOf('\n', i)
      copyUntil(end === -1 ? script.length : end)
    } else if (rest.startsWith('/*')) {
      const end = script.indexOf('*/', i + 2)
      copyUntil(end === -1 ? script.length : end + 2)
    } else if (rest[0] === "'" || rest[0] === '"') {
      // In an escape string (E'...'), a backslash escapes the next character, \' included.
      const escapes =
        rest[0] === "'" && /[Ee]/.test(script[i - 1] ?? '') && !isWordChar(script[i - 2])
      let end = i + 1
      while (end < script.length) {
        if (escapes && script[end] === '\\') {
          end += 2
          continue
        }
        if (script[end] === rest[0]) {
          if (script[end + 1] !== rest[0]) break
          end++
        }
        end++
      }
      copyUntil(Math.min(end + 1, script.length))
    } else if (!isWordChar(script[i - 1]) && /^\$([A-Za-z_]\w*)?\$/.test(rest)) {
      // A `$` inside an identifier (a$b$c) is part of the name, not the start of a dollar quote.
      const tag = /^\$([A-Za-z_]\w*)?\$/.exec(rest)?.[0] ?? '$$'
      const end = script.indexOf(tag, i + tag.length)
      copyUntil(end === -1 ? script.length : end + tag.length)
    } else if (rest.startsWith('::')) {
      copyUntil(i + 2)
    } else if (/^:'[A-Za-z_]\w*'/.test(rest)) {
      const reference = /^:'([A-Za-z_]\w*)'/.exec(rest)
      const name = reference?.[1] ?? ''
      if (!Object.prototype.hasOwnProperty.call(variables, name))
        throw new Error(`SQL variable :'${name}' was not supplied`)
      current += quote(variables[name])
      i += name.length + 3
    } else if (rest[0] === ';') {
      statements.push(current.trim())
      current = ''
      i++
    } else {
      copyUntil(i + 1)
    }
  }
  statements.push(current.trim())
  return statements.filter(Boolean)
}

/**
 * Format a result as `psql -At` prints it. A statement that returns no columns (UPDATE without
 * RETURNING, DDL) prints nothing; psql's command tags are not reproduced.
 *
 * @param {{ fields: unknown[], rows: unknown[][] }} result
 * @returns {string[]}
 */
export function formatRows(result) {
  if (result.fields.length === 0) return []
  return result.rows.map(row => row.map(value => (value === null ? '' : String(value))).join('|'))
}

// Every value as the server's text, as psql prints it: no Date, number or JSON conversion.
const serverText = { getTypeParser: () => (/** @type {string} */ value) => value }

/**
 * @param {{ url: string, statement: string, variables?: Record<string, string> }} request
 * @returns {Promise<string>}
 */
export async function runSql({ url, statement, variables = {} }) {
  // Bounded like the probes it replaced: an unreachable database fails in seconds, not at the OS
  // TCP timeout.
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 })
  await client.connect()
  try {
    const lines = []
    for (const text of prepareStatements(statement, variables, value =>
      client.escapeLiteral(value),
    )) {
      const result = await client.query({ text, rowMode: 'array', types: serverText })
      lines.push(...formatRows(result))
    }
    return lines.join('\n')
  } finally {
    await client.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.resolve()
    .then(() => runSql(JSON.parse(readFileSync(0, 'utf8'))))
    .then(
      output => process.stdout.write(output),
      error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
      },
    )
}
