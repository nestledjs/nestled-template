import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { auditFiles, auditSource, formatFindings } from './audit-mutation-error-reads.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const verdicts = (text, fileName = 'page.tsx') =>
  auditSource(fileName, text).map(({ line, read, verdict }) => ({ line, read, verdict }))

describe('audit-mutation-error-reads', () => {
  it('flags a hook with no errorPolicy whose result error is read with nothing to catch it', () => {
    const text = [
      'export function Page() {',
      '  const [save] = useMutation(Save)',
      '  const onSubmit = async () => {',
      '    const result = await save({ variables: {} })',
      '    if (result.error) setMessage(result.error.message)',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(verdicts(text), [{ line: 4, read: 'reads result.error', verdict: 'uncaught' }])
  })

  it('flags a destructured error, a generated hook and a .then read', () => {
    const text = [
      'export function Page() {',
      '  const [save] = useSaveThingMutation()',
      '  const [remove] = useMutation<RemoveMutation>(',
      '    Remove,',
      '    { refetchQueries: [List] },',
      '  )',
      '  const a = async () => {',
      '    const { data, errors } = await save()',
      '  }',
      '  const b = () => remove().then(({ error }) => error && show(error))',
      '}',
    ].join('\n')
    assert.deepEqual(verdicts(text), [
      { line: 8, read: 'destructures error', verdict: 'uncaught' },
      { line: 10, read: 'destructures error in .then', verdict: 'uncaught' },
    ])
  })

  it('calls the read dead when a try/catch or a .catch sees the rejection', () => {
    const text = [
      'export function Page() {',
      '  const [save] = useMutation(Save)',
      '  const a = async () => {',
      '    try {',
      '      const result = await save()',
      '      if (result.errors) return',
      '    } catch (error) {',
      '      show(error)',
      '    }',
      '  }',
      '  const b = () => save().then(r => r.error).catch(show)',
      '}',
    ].join('\n')
    assert.deepEqual(
      verdicts(text).map(finding => finding.verdict),
      ['dead-read', 'dead-read'],
    )
  })

  it('follows the executor into a helper of the same file, and a result handed to an error helper', () => {
    const text = [
      'async function runUpdate(update: any, id: string) {',
      '  const result = await update({ variables: { id } })',
      '  if (result.errors) return false',
      '  return true',
      '}',
      'export function Page() {',
      '  const [update] = useMutation(Update)',
      '  const [create] = useMutation(Create)',
      '  const a = () => runUpdate(update, "1")',
      '  const b = async () => {',
      '    const result = await create()',
      '    const message = mutationErrorMessage(result)',
      '    setData(result)',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(verdicts(text), [
      { line: 2, read: 'reads result.errors', verdict: 'uncaught' },
      { line: 11, read: 'passes result to mutationErrorMessage()', verdict: 'uncaught' },
    ])
  })

  it('flags client.mutate with no errorPolicy, and skips every call that sets one', () => {
    const text = [
      'export async function run(client: any) {',
      '  const { error } = await client.mutate({ mutation: Save })',
      "  const r = await client.mutate({ mutation: Save, errorPolicy: 'all' })",
      '  if (r.error) return',
      '}',
      'export function Page() {',
      "  const [save] = useMutation(Save, { errorPolicy: 'all' })",
      "  const [other] = useOtherMutation({ errorPolicy: 'none' })",
      '  const a = async () => {',
      '    const result = await save()',
      '    if (result.error) return',
      '    const { error } = await other()',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(verdicts(text, 'run.ts'), [
      { line: 2, read: 'destructures error', verdict: 'uncaught' },
    ])
  })

  it('counts a try only when the promise is awaited inside it', () => {
    const text = [
      'export function Page() {',
      '  const [save] = useMutation(Save)',
      '  const a = () => {',
      '    try {',
      '      save().then(result => show(result.error))',
      '    } catch (error) {',
      '      show(error)',
      '    }',
      '  }',
      '  const b = async () => {',
      '    try {',
      '      await save().then(result => show(result.error))',
      '    } catch (error) {',
      '      show(error)',
      '    }',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(
      verdicts(text).map(finding => finding.verdict),
      ['uncaught', 'dead-read'],
    )
  })

  it('counts a catch around the helper call that the executor was handed to', () => {
    const text = [
      'async function runUpdate(update: any, id: string) {',
      '  const result = await update({ variables: { id } })',
      '  return !result.errors',
      '}',
      'export function Page() {',
      '  const [update] = useMutation(Update)',
      '  const a = async () => {',
      '    try {',
      '      await runUpdate(update, "1")',
      '    } catch (error) {',
      '      show(error)',
      '    }',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(verdicts(text), [
      { line: 2, read: 'reads result.errors', verdict: 'dead-read' },
    ])
  })

  it('reads an errorPolicy passed to the executor itself', () => {
    const text = [
      'export function Page(options: any) {',
      '  const [save] = useMutation(Save)',
      "  const [keep] = useMutation(Keep, { errorPolicy: 'none' })",
      '  const a = async () => {',
      "    const result = await save({ errorPolicy: 'all' })",
      '    if (result.error) return',
      '    const second = await save(options)',
      '    if (second.error) return',
      "    const third = await keep({ variables: {}, errorPolicy: 'all' })",
      '    if (third.error) return',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(verdicts(text), [
      { line: 7, read: 'reads second.error', verdict: 'check-by-hand' },
    ])
  })

  it('asks for a hand check when the options may set errorPolicy where it cannot see', () => {
    const text = [
      'export function useGuarded(doc: any, options: any) {',
      '  const [run] = useMutation(doc, options)',
      '  const [other] = useMutation(doc, { ...options, refetchQueries: [] })',
      '  return async () => {',
      '    const result = await run()',
      '    const second = await other()',
      '    return !result.error && !second.error',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(
      verdicts(text, 'guarded.ts').map(finding => finding.verdict),
      ['check-by-hand', 'check-by-hand'],
    )
  })

  it('ignores reads of data, and calls whose result is not kept', () => {
    const text = [
      'export function Page() {',
      '  const [save] = useMutation(Save)',
      '  const a = async () => {',
      '    const result = await save()',
      '    if (result.data?.save) done()',
      '    await save()',
      '  }',
      '}',
    ].join('\n')
    assert.deepEqual(verdicts(text), [])
  })

  it('formats findings by verdict, and says so when there are none', () => {
    assert.equal(formatFindings([]), 'No mutation site reads a refusal from its result.\n')
    const out = formatFindings([
      { file: 'a.tsx', line: 9, siteLine: 2, read: 'reads result.error', verdict: 'uncaught' },
    ])
    assert.match(out, /^uncaught \(1\): nothing catches the rejection/)
    assert.match(out, /a\.tsx:9 {2}reads result\.error \(mutation set up at line 2\)/)
  })

  it('finds no site in this repository that reads a refusal from its result uncaught', () => {
    const uncaught = auditFiles(root, ['apps', 'libs']).filter(
      finding => finding.verdict === 'uncaught',
    )
    assert.deepEqual(uncaught, [], formatFindings(uncaught))
  })
})
