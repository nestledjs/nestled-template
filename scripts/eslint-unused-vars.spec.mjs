import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const RULE = '@typescript-eslint/no-unused-vars'
const ERROR = 2

/** The folder of the eslint.config.mjs nearest to a path: the config ESLint applies to it. */
function nearestConfigFolder(path, configFolders) {
  return configFolders
    .filter(folder => folder === '.' || path.startsWith(`${folder}/`))
    .reduce(
      (nearest, folder) => (nearest === '.' || folder.length > nearest.length ? folder : nearest),
      '.',
    )
}

/** One tracked TypeScript file per eslint.config.mjs that lints any, keyed by the config. */
function oneFilePerConfig() {
  const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*eslint.config.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const configFolders = tracked.filter(path => path.endsWith('eslint.config.mjs')).map(dirname)
  // apps/web/tests had its own override turning the rule off; check that it stays on there.
  const files = new Map([['apps/web/tests', 'apps/web/tests/routes/logout.spec.tsx']])
  for (const path of tracked) {
    if (!/\.tsx?$/.test(path) || path.endsWith('.d.ts')) continue
    const folder = nearestConfigFolder(path, configFolders)
    if (!files.has(folder)) files.set(folder, path)
  }
  return files
}

/**
 * Unused code fails lint everywhere: a warning never fails `nx run-many -t lint`, so unused imports,
 * locals and dead destructures reached CI and Sonar instead of failing at the desk. The `_` prefix
 * stays the way to keep a name deliberately. `nx.configs['flat/react']` sets a looser level of its
 * own, so a React config that spreads it after the base must spread `unusedVarsRule` after it too.
 */
describe('no-unused-vars', () => {
  const eslint = new ESLint({ cwd: root })

  for (const [folder, file] of oneFilePerConfig()) {
    it(`is an error, with the _ escape, under ${folder} (checked on ${file})`, async () => {
      const resolved = await eslint.calculateConfigForFile(join(root, file))
      const setting = resolved.rules?.[RULE]
      assert.ok(setting, `${RULE} is not configured for ${file}`)
      const [severity, options = {}] = setting
      assert.equal(severity, ERROR, `${RULE} is not an error for ${file}`)
      assert.equal(options.argsIgnorePattern, '^_')
      assert.equal(options.varsIgnorePattern, '^_')
      assert.equal(options.caughtErrorsIgnorePattern, '^_')
    })
  }
})
