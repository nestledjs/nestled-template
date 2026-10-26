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

// A dollar-quote tag follows identifier rules without `$`: a letter, `_` or any non-ASCII character,
// then those or digits ($body$, $café$). `\w` alone would stop at the é and miss the tag.
const dollarTag = /^\$(?:[A-Za-z_\u0080-\uFFFF][\w\u0080-\uFFFF]*)?\$/

/**
 * The index just past the block comment opening at `start`. PostgreSQL nests block comments
 * (`/* a /* b *\/ c *\/`), so the comment ends at the closing marker that balances its opener.
 *
 * @param {string} script
 * @param {number} start
 * @returns {number}
 */
function blockCommentEnd(script, start) {
  let depth = 0
  let i = start
  while (i < script.length) {
    if (script.startsWith('/*', i)) {
      depth++
      i += 2
    } else if (script.startsWith('*/', i)) {
      depth--
      i += 2
      if (depth === 0) return i
    } else {
      i++
    }
  }
  return script.length
}

/**
 * Split a script into statements, replacing `:'name'` with `quote(variables[name])`. Quoted strings
 * (escape strings E'...' included), quoted identifiers, dollar-quoted bodies and comments are copied
 * untouched, and a `$` inside an identifier does not open a dollar quote. Dollar-quote tags may use
 * non-ASCII letters, and nested block comments end where PostgreSQL ends them.
 *
 * @param {string} script
 * @param {Record<string, string>} variables
 * @param {(value: string) => string} quote
 * @returns {string[]}
 */
export function prepareStatements(script, variables, quote) {
  // PostgreSQL identifiers may also contain any non-ASCII character, which `\w` does not match.
  const isWordChar = (/** @type {string | undefined} */ char) =>
    char !== undefined && /[\w$\u0080-\uFFFF]/.test(char)
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
      copyUntil(blockCommentEnd(script, i))
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
    } else if (!isWordChar(script[i - 1]) && dollarTag.test(rest)) {
      // A `$` inside an identifier (a$b$c) is part of the name, not the start of a dollar quote.
      const tag = dollarTag.exec(rest)?.[0] ?? '$$'
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

/**
 * A thrown value that is not an Error, as text: a string as it is, a number, boolean or bigint in
 * its usual form, anything else as JSON. Empty when there is nothing to say (null, undefined, or a
 * value JSON cannot represent), so the caller can fall back.
 *
 * @param {unknown} value
 * @returns {string}
 */
function thrownValueText(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString()
  }
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

/**
 * Why an operation failed, in words. pg rejects a refused connection with Node's AggregateError,
 * whose own message is empty (one error per address tried, e.g. ::1 and 127.0.0.1): its nested
 * messages say why, and its `code` (ECONNREFUSED) when they are missing too. The result is not yet
 * scrubbed; pass it through scrubCredentials before printing it.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorReason(error) {
  if (!(error instanceof Error)) return thrownValueText(error) || 'unknown error'
  if (error.message) return error.message
  const nested =
    error instanceof AggregateError
      ? error.errors
          .map(inner => (inner instanceof Error ? inner.message : thrownValueText(inner)))
          .filter(Boolean)
      : []
  if (nested.length > 0) return [...new Set(nested)].join('; ')
  const code = /** @type {{ code?: unknown }} */ (error).code
  if (typeof code === 'string' && code) return code
  return error.name || 'unknown error'
}

/**
 * An error message with the request's URL, its user-info and its password removed, and the user-info
 * of any other `scheme://user:password@` in it: the runner's errors reach terminals and CI logs.
 *
 * @param {string} message
 * @param {string | undefined} url
 * @returns {string}
 */
export function scrubCredentials(message, url) {
  let scrubbed = message
  if (url) {
    const userInfo = /^[a-z]+:\/\/([^@/?#]*)@/i.exec(url)?.[1] ?? ''
    const password = userInfo.split(':').slice(1).join(':')
    let decoded = password
    try {
      decoded = decodeURIComponent(password)
    } catch {
      // Not valid percent-encoding: the raw form is scrubbed below.
    }
    for (const secret of [url, userInfo, password, decoded].filter(Boolean)) {
      scrubbed = scrubbed.split(secret).join('***')
    }
  }
  return dropUserInfo(scrubbed)
}

/**
 * Text with the user-info of every `scheme://user:password@host` replaced by `***`. A plain scan
 * rather than a regex, so a long or malformed message cannot make it backtrack.
 *
 * @param {string} text
 * @returns {string}
 */
function dropUserInfo(text) {
  let result = ''
  let from = 0
  let separator = text.indexOf('://')
  while (separator !== -1) {
    const start = separator + 3
    let end = start
    while (end < text.length && !'@/ \t\r\n'.includes(text[end])) end++
    const hasUserInfo = text[end] === '@' && end > start
    result += text.slice(from, start) + (hasUserInfo ? '***' : text.slice(start, end))
    from = end
    separator = text.indexOf('://', end)
  }
  return result + text.slice(from)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  /** @type {string | undefined} */
  let url
  Promise.resolve()
    .then(() => {
      const request = JSON.parse(readFileSync(0, 'utf8'))
      url = typeof request?.url === 'string' ? request.url : undefined
      return runSql(request)
    })
    .then(
      output => process.stdout.write(output),
      error => {
        process.stderr.write(`${scrubCredentials(errorReason(error), url)}\n`)
        process.exitCode = 1
      },
    )
}
