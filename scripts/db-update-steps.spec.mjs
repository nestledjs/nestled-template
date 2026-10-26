import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  generateScriptEndsWithDoctor,
  runDbUpdateSteps,
  trailingDoctorWarning,
} from './db-update-steps.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// A model the generators manage, with the root fields its admin CRUD exposes.
const rootsFor = model => [`${model}`, `${model}s`, `create${model}`, `update${model}`]

/**
 * A miniature workspace: the generators own the SDK documents, the API owns the emitted schema, and
 * Doctor's sdk-contract check fails when a schema root field has no SDK document.
 */
function workspace(models, nextModels) {
  const state = {
    schemaRoots: new Set(models.flatMap(rootsFor)),
    sdkDocuments: new Set(models.flatMap(rootsFor)),
    sdkCompiledFrom: null,
  }
  const calls = []
  const steps = {
    generate: () => {
      calls.push('generate')
      state.sdkDocuments = new Set(nextModels.flatMap(rootsFor))
    },
    refreshSchema: async () => {
      calls.push('refreshSchema')
      state.schemaRoots = new Set(nextModels.flatMap(rootsFor))
    },
    refreshSdk: () => {
      calls.push('refreshSdk')
      state.sdkCompiledFrom = new Set(state.schemaRoots)
    },
    doctor: () => {
      calls.push('doctor')
      const missing = [...state.schemaRoots].filter(field => !state.sdkDocuments.has(field))
      if (missing.length > 0) {
        throw new Error(`sdk-contract: no SDK document for ${missing.join(', ')}`)
      }
    },
  }
  return { state, calls, steps }
}

describe('runDbUpdateSteps', () => {
  it('runs Doctor last, after the schema refresh and the SDK', async () => {
    const { calls, steps } = workspace(['Widget'], ['Widget'])
    await runDbUpdateSteps(steps)
    assert.deepEqual(calls, ['generate', 'refreshSchema', 'refreshSdk', 'doctor'])
  })

  it('passes when a generated model is retired', async () => {
    const { state, steps } = workspace(['Widget', 'Gadget'], ['Widget'])
    await runDbUpdateSteps(steps)
    assert.deepEqual([...state.schemaRoots].sort(), rootsFor('Widget').sort())
    assert.deepEqual([...state.sdkCompiledFrom].sort(), rootsFor('Widget').sort())
  })

  it('reproduces the failure the old order hit: Doctor between generation and the refresh', async () => {
    const { steps } = workspace(['Widget', 'Gadget'], ['Widget'])
    await steps.generate()
    assert.throws(() => steps.doctor(), /sdk-contract: no SDK document for Gadget, Gadgets/)
  })

  it('still fails when the refreshed contract is broken', async () => {
    const { state, steps } = workspace(['Widget'], ['Widget'])
    const refresh = steps.refreshSchema
    steps.refreshSchema = async () => {
      await refresh()
      state.schemaRoots.add('orphanRoot')
    }
    await assert.rejects(runDbUpdateSteps(steps), /no SDK document for orphanRoot/)
  })

  it('stops at the first failing step', async () => {
    const { calls, steps } = workspace(['Widget'], ['Widget'])
    steps.refreshSchema = () => {
      calls.push('refreshSchema')
      throw new Error('API exited')
    }
    await assert.rejects(runDbUpdateSteps(steps), /API exited/)
    assert.deepEqual(calls, ['generate', 'refreshSchema'])
  })
})

describe('db-update:generate', () => {
  it('recognises a trailing Doctor run', () => {
    assert.equal(
      generateScriptEndsWithDoctor('pnpm run nestled-doctor && nx g x && pnpm run nestled-doctor'),
      true,
    )
    assert.equal(generateScriptEndsWithDoctor('nx g x && pnpm nestled-doctor'), true)
    assert.equal(generateScriptEndsWithDoctor('pnpm run nestled-doctor && nx g x'), false)
    assert.equal(generateScriptEndsWithDoctor(''), false)
  })

  it('keeps the preflight Doctor run and has no trailing one in the template', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const script = manifest.scripts['db-update:generate']
    assert.match(script, /^pnpm run nestled-doctor && /)
    assert.equal(generateScriptEndsWithDoctor(script), false)
  })

  it('warns about a trailing Doctor run only when package.json can be read', async () => {
    const manifest = (/** @type {string} */ script) => async () =>
      JSON.stringify({ scripts: { 'db-update:generate': script } })
    assert.match(
      (await trailingDoctorWarning(manifest('nx g x && pnpm run nestled-doctor'))) ?? '',
      /still ends with nestled-doctor/,
    )
    assert.equal(await trailingDoctorWarning(manifest('pnpm run nestled-doctor && nx g x')), null)
    assert.equal(await trailingDoctorWarning(async () => JSON.stringify({})), null)
    assert.equal(await trailingDoctorWarning(async () => 'not json'), null)
    const missing = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    assert.equal(
      await trailingDoctorWarning(async () => {
        throw missing
      }),
      null,
    )
  })
})
