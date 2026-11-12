import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Wherever SonarCloud is told to skip `**\/vite.config.ts`, it also skips `**\/vite.config.mts`.
 *
 * A config that Node must load as ESM is named vite.config.mts (libs/web-ui's is; see
 * vite-config-module-format.spec.mjs). Sonar's exclusions are globs on the file name, so a list that
 * names only the .ts form analyses the .mts config as source, counts it as uncovered code and checks
 * it for duplication. SONARCLOUD_SETUP.md mirrors the same lists for the SonarCloud UI.
 */
const TS_CONFIG = '**/vite.config.ts'
const MTS_CONFIG = '**/vite.config.mts'

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

/** Properties that list the .ts config without the .mts one. */
export function propertiesMissingMts(source) {
  return Object.entries(propertyLists(source))
    .filter(([, values]) => values.includes(TS_CONFIG) && !values.includes(MTS_CONFIG))
    .map(([key]) => key)
}

/** The index of each fenced block of a Markdown file that lists the .ts config without the .mts one. */
export function fencedBlocksMissingMts(markdown) {
  const blocks = [...markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(match =>
    match[1].split('\n').map(line => line.trim()),
  )
  return blocks.flatMap((lines, index) =>
    lines.includes(TS_CONFIG) && !lines.includes(MTS_CONFIG) ? [index] : [],
  )
}

describe('Sonar exclusions name vite.config.mts beside vite.config.ts', () => {
  it('in sonar-project.properties', () => {
    const path = join(root, 'sonar-project.properties')
    if (!existsSync(path)) return
    assert.deepEqual(propertiesMissingMts(readFileSync(path, 'utf8')), [])
  })

  it('in SONARCLOUD_SETUP.md', () => {
    const path = join(root, 'SONARCLOUD_SETUP.md')
    if (!existsSync(path)) return
    assert.deepEqual(fencedBlocksMissingMts(readFileSync(path, 'utf8')), [])
  })

  it('flags a continued property list that names only the .ts config', () => {
    const source = [
      'sonar.exclusions=\\',
      '  **/dist/**,\\',
      '  **/vite.config.ts',
      'sonar.cpd.exclusions=\\',
      '  **/vite.config.ts,\\',
      '  **/vite.config.mts',
      'sonar.sources=apps',
      '',
    ].join('\n')
    assert.deepEqual(propertiesMissingMts(source), ['sonar.exclusions'])
  })

  it('flags a fenced list in the setup guide that names only the .ts config', () => {
    const markdown = [
      '## Exclusions',
      '```',
      '**/vite.config.ts',
      '```',
      '## Coverage',
      '```',
      '**/vite.config.ts',
      '**/vite.config.mts',
      '```',
      '',
    ].join('\n')
    assert.deepEqual(fencedBlocksMissingMts(markdown), [0])
  })
})
