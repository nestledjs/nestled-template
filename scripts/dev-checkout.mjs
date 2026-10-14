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
  const gitDirLine = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, 'utf8'))
  if (!gitDirLine) return root
  const gitDir = resolve(root, gitDirLine[1])
  const commonDirFile = join(gitDir, 'commondir')
  if (!existsSync(commonDirFile)) return root
  const commonDir = resolve(gitDir, readFileSync(commonDirFile, 'utf8').trim())
  return basename(commonDir) === '.git' ? dirname(commonDir) : root
}

/**
 * Whether a .env file sets `name` to something. An empty or quoted-empty value counts as unset, as
 * compose's `${NAME:-default}` treats it. Keep in step with NESTLED_DEV_DATA_DIR_SET in
 * dev-checkout.sh.
 *
 * @param {string} file
 * @param {string} name
 * @returns {boolean}
 */
export function definesVariable(file, name) {
  return new RegExp(
    `^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=[ \\t]*(?:[^"'\\s#]|"[^"]|'[^'])`,
    'm',
  ).test(readFileSync(file, 'utf8'))
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
