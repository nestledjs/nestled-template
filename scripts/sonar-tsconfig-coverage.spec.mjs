import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

/**
 * Every analysed project is in one of the TypeScript programs SonarCloud builds.
 *
 * sonar.typescript.tsconfigPaths names the programs (sonar/tsconfig.api.json and
 * sonar/tsconfig.web.json). A project whose files are in sonar.sources but in neither program's
 * "include" is still analysed, only without type information: its type-aware rules go quiet and
 * nothing says so. So a new library or app has to be added to one of the two lists, and this is
 * the check that it was. It expands each config's include and exclude the way tsc does (no type
 * check, so it is fast) and asks that every sonar.sources folder holding TypeScript has at least
 * one file in some program.
 */
const TS_FILE = /\.(c|m)?tsx?$/

/** Each property of a .properties file, with backslash-continued lines joined, as a list of values. */
export function propertyLists(source) {
  const lists = {}
  const logical = source.replace(/\\\r?\n[ \t]*/g, '').split(/\r?\n/)
  for (const line of logical) {
    const match = /^\s*([\w.]+)\s*=\s*(.*)$/.exec(line)
    if (match) {
      lists[match[1]] = match[2]
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    }
  }
  return lists
}

function hasTypeScript(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory() ? hasTypeScript(path) : TS_FILE.test(entry.name)) return true
  }
  return false
}

/** The workspace-relative files a tsconfig's include/exclude select, as tsc expands them. */
function programFiles(ts, configPath) {
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile)
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath))
  return { config, files: parsed.fileNames.map(file => relative(root, file).split(sep).join('/')) }
}

/** The sonar.sources folders that hold TypeScript but have no file in any of the programs. */
export function uncoveredSources(sources, files) {
  return sources.filter(source => {
    const prefix = `${source.replace(/\/$/, '')}/`
    return !files.some(file => file.startsWith(prefix))
  })
}

describe('Sonar TypeScript programs', () => {
  const propertiesPath = join(root, 'sonar-project.properties')
  const properties = existsSync(propertiesPath)
    ? propertyLists(readFileSync(propertiesPath, 'utf8'))
    : null
  const configs = properties?.['sonar.typescript.tsconfigPaths'] ?? []

  it('are named, not discovered', { skip: !properties }, () => {
    assert.ok(
      configs.length > 0,
      'Set sonar.typescript.tsconfigPaths: unset, Sonar builds one program per tsconfig*.json in the tree.',
    )
    for (const config of configs) assert.ok(existsSync(join(root, config)), `${config} is missing`)
  })

  it('cover every sonar.sources folder that holds TypeScript', { skip: !properties }, () => {
    const ts = require('typescript')
    const files = configs.flatMap(config => programFiles(ts, join(root, config)).files)
    const sources = (properties['sonar.sources'] ?? []).filter(source => {
      const path = join(root, source)
      return existsSync(path) && hasTypeScript(path)
    })
    assert.deepEqual(
      uncoveredSources(sources, files),
      [],
      'Add these to the "include" of sonar/tsconfig.api.json (Jest, CommonJS) or sonar/tsconfig.web.json (Vitest, Vite).',
    )
  })

  it('written for Sonar inherit lib from tsconfig.base.json', { skip: !properties }, () => {
    const ts = require('typescript')
    for (const config of configs.filter(path => path.startsWith('sonar/'))) {
      const { config: raw } = programFiles(ts, join(root, config))
      assert.equal(
        raw.compilerOptions?.lib,
        undefined,
        `${config} sets "lib": Sonar would suggest APIs the build cannot type-check.`,
      )
    }
  })

  it('flags a source folder that no program includes', () => {
    assert.deepEqual(
      uncoveredSources(
        ['apps/api/src', 'libs/new-lib/src', 'libs/web/src/'],
        ['apps/api/src/main.ts', 'libs/web/src/index.ts', 'libs/new-lib-two/src/index.ts'],
      ),
      ['libs/new-lib/src'],
    )
  })
})
