import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tsx = join(root, 'node_modules/.bin/tsx')
const validator = join(root, 'scripts/validate-upgrade-notes.ts')

const workspaces = []

afterEach(() => {
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A note that validates on its own; `extra` is appended as more top-level YAML. */
const note = (id, extra = '') =>
  [
    `id: ${id}`,
    'title: Example note',
    'priority: normal',
    'area: api',
    'type: correctness',
    'delivery: code-patch',
    'intent: Keep the example behaviour.',
    'why: It matters.',
    'affectedPaths:',
    '  - apps/api/**',
    extra,
  ].join('\n')

/**
 * Runs the validator in a workspace holding `notes` (id -> YAML) and `archived` (id -> YAML), the
 * same way CI does: from the workspace root, where it reads `.nestled-updates/upgrade-notes/`.
 */
function validate(notes, archived = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'upgrade-notes-'))
  workspaces.push(cwd)
  const notesDir = join(cwd, '.nestled-updates/upgrade-notes')
  mkdirSync(join(notesDir, 'archive'), { recursive: true })
  for (const [id, yaml] of Object.entries(notes)) writeFileSync(join(notesDir, `${id}.yaml`), yaml)
  for (const [id, yaml] of Object.entries(archived))
    writeFileSync(join(notesDir, 'archive', `${id}.yaml`), yaml)
  const result = spawnSync(tsx, [validator], { cwd, encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const first = '2026-01-01-first-note'
const second = '2026-01-02-second-note'

describe('validate-upgrade-notes applyAfter', () => {
  it('accepts a list of ids naming an existing note', () => {
    const result = validate({
      [first]: note(first),
      [second]: note(second, `applyAfter: [${first}]`),
    })
    assert.equal(result.status, 0, result.output)
  })

  it('accepts a single id as a string', () => {
    const result = validate({
      [first]: note(first),
      [second]: note(second, `applyAfter: ${first}`),
    })
    assert.equal(result.status, 0, result.output)
  })

  it('accepts an id of an archived note', () => {
    const result = validate(
      { [second]: note(second, `applyAfter: [${first}]`) },
      { [first]: note(first) },
    )
    assert.equal(result.status, 0, result.output)
  })

  it('rejects an id that matches no note', () => {
    const result = validate({
      [first]: note(first),
      [second]: note(second, 'applyAfter: [2026-01-03-no-such-note]'),
    })
    assert.equal(result.status, 1)
    assert.match(result.output, /applyAfter names 2026-01-03-no-such-note, which matches no note/)
  })

  it('rejects a note naming itself', () => {
    const result = validate({ [first]: note(first, `applyAfter: [${first}]`) })
    assert.equal(result.status, 1)
    assert.match(result.output, /applyAfter must not name the note itself/)
  })

  for (const [label, value] of [
    ['an empty list', '[]'],
    ['an empty string', "''"],
    ['a list with a non-string entry', '[1]'],
    ['a map', '{ id: x }'],
  ]) {
    it(`rejects ${label}`, () => {
      const result = validate({
        [first]: note(first),
        [second]: note(second, `applyAfter: ${value}`),
      })
      assert.equal(result.status, 1)
      assert.match(result.output, /applyAfter must be a note id or a non-empty list of note ids/)
    })
  }

  it('leaves a note without applyAfter valid', () => {
    const result = validate({ [first]: note(first) })
    assert.equal(result.status, 0, result.output)
  })
})
