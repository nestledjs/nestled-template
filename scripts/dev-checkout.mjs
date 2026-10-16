// The checkout-aware settings for the dev Docker stack, as scripts/dev-checkout.sh computes them for
// the shell scripts, for node scripts (pnpm db-update) that must not spawn git.
//
// The compose project name and container names are fixed, so every git worktree drives the same
// containers. From a worktree, compose gets the main checkout's .env when the worktree has none,
// and NESTLED_DEV_DATA_DIR defaults to the main checkout's .dev/tmp, so the containers are neither
// recreated with other ports nor given data mounts inside a worktree that will be deleted. A single
// checkout is unchanged.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/**
 * The main checkout that owns `root`, read from disk. In a linked worktree `.git` is a file naming
 * the worktree's git directory, whose `commondir` names the shared one; the main checkout is the
 * parent of that shared `.git`. Anything else (a main checkout, a submodule or separate git dir, no
 * git at all) resolves to `root`.
 *
 * @param {string} root
 * @returns {string}
 */
export function mainCheckoutRoot(root) {
  const dotGit = join(root, '.git')
  if (!existsSync(dotGit) || statSync(dotGit).isDirectory()) return root
  // A line scan rather than a lazy regex, which backtracks super-linearly on a long line.
  const gitDirPath = readFileSync(dotGit, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.startsWith('gitdir:'))
    ?.slice('gitdir:'.length)
    .trim()
  if (!gitDirPath) return root
  const gitDir = resolve(root, gitDirPath)
  const commonDirFile = join(gitDir, 'commondir')
  if (!existsSync(commonDirFile)) return root
  const commonDir = resolve(gitDir, readFileSync(commonDirFile, 'utf8').trim())
  return basename(commonDir) === '.git' ? dirname(commonDir) : root
}

const ASSIGNMENT = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][\w.-]*)[ \t]*=/

// The index of the quote that closes a value in `text`, or -1. As in compose, a backslash escapes
// the next character inside either kind of quote: `'It\'s'` is one single-quoted value.
function closingQuote(text, quote) {
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\\') index++
    else if (text[index] === quote) return index
  }
  return -1
}

// One .env line read as an assignment: the key, the trimmed text after `=`, the quote that text
// starts with (if any), and whether that quote is still open at the end of the line. Undefined when
// the line is not an assignment.
function splitAssignment(line) {
  const match = ASSIGNMENT.exec(line)
  if (!match) return undefined
  const rest = line.slice(match[0].length).trim()
  const quote = rest.startsWith('"') || rest.startsWith("'") ? rest[0] : undefined
  const opens = quote !== undefined && closingQuote(rest.slice(1), quote) === -1
  return { key: match[1], rest, quote, opens }
}

/**
 * The text after `=` in the last assignment of `name` in a .env (an `export ` prefix and spaces
 * around the name allowed), trimmed, or undefined when there is none. Compose and dotenv both let a
 * later assignment win. Lines inside another key's multi-line quoted value are not assignments, as
 * compose reads them; a `name` whose own value spans lines throws, since no caller needs one. Keep
 * in step with nestled_env_line in dev-checkout.sh.
 *
 * @param {string} contents
 * @param {string} name
 * @returns {string | undefined}
 */
export function lastAssignment(contents, name) {
  let value
  let multiline = false
  let openQuote
  for (const line of contents.split(/\r?\n/)) {
    if (openQuote) {
      if (closingQuote(line, openQuote) !== -1) openQuote = undefined
      continue
    }
    const assignment = splitAssignment(line)
    if (!assignment) continue
    const { key, rest, quote, opens } = assignment
    if (key === name) {
      value = rest
      multiline = opens
    }
    if (opens) openQuote = quote
  }
  if (multiline)
    throw new Error(`.env gives ${name} a quoted value that spans lines; put it on one line.`)
  return value
}

/**
 * Whether a .env file gives `name` a non-empty value, which is when compose's `${NAME:-default}`
 * uses it: the last assignment counts, and an empty or quoted-empty value counts as unset. Throws
 * on an unquoted value that starts with `#` (`NAME= # note`): compose reads it as `# note`, dotenv
 * as empty, so neither answer is safe. Keep in step with nestled_env_sets in dev-checkout.sh.
 *
 * @param {string} file
 * @param {string} name
 * @returns {boolean}
 */
export function definesVariable(file, name) {
  const value = lastAssignment(readFileSync(file, 'utf8'), name)
  if (value === undefined || value === '' || value.startsWith('""') || value.startsWith("''")) {
    return false
  }
  if (value.startsWith('#')) {
    throw new Error(
      `${file} sets ${name} to an unquoted value that starts with '#' (${value}). docker compose ` +
        `reads that as the value and dotenv as empty. Remove the comment, or quote the value ("" for empty).`,
    )
  }
  return true
}

/**
 * Where compose should read its .env from, and the variables to add to compose's environment.
 *
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ mainCheckout: string, envFile: string | undefined, composeVariables: Record<string, string> }}
 */
export function devDockerSettings(root, env = process.env) {
  const mainCheckout = mainCheckoutRoot(root)
  const envFile = [join(root, '.env'), join(mainCheckout, '.env')].find(file => existsSync(file))
  /** @type {Record<string, string>} */
  const composeVariables = {}
  if (
    mainCheckout !== root &&
    !env.NESTLED_DEV_DATA_DIR &&
    !(envFile && definesVariable(envFile, 'NESTLED_DEV_DATA_DIR'))
  ) {
    composeVariables.NESTLED_DEV_DATA_DIR = join(mainCheckout, '.dev', 'tmp')
  }
  return { mainCheckout, envFile, composeVariables }
}
