// The order `pnpm db-update` runs its steps in, kept apart from db-update.mjs (which starts work as
// soon as it is imported) so a spec can check it.
//
// Doctor's final check compares the SDK documents with api-schema.graphql. The generators rewrite
// the SDK documents first, so until the API has re-emitted the schema and the typed SDK has been
// rebuilt, the two describe different contracts: a retired generated model's SDK documents are
// already gone while the stale schema still lists its root fields. The final Doctor run therefore
// comes last, after the schema refresh and the SDK. `db-update:generate` keeps only the preflight
// Doctor run that precedes the generators.

/**
 * @param {{
 *   generate: () => unknown | Promise<unknown>,
 *   refreshSchema: () => unknown | Promise<unknown>,
 *   refreshSdk: () => unknown | Promise<unknown>,
 *   doctor: () => unknown | Promise<unknown>,
 * }} steps
 */
export async function runDbUpdateSteps(steps) {
  await steps.generate()
  await steps.refreshSchema()
  await steps.refreshSdk()
  await steps.doctor()
}

/**
 * True when a `db-update:generate` script ends by running Doctor, the order that checked the SDK
 * contract against the previous schema.
 *
 * @param {string} script
 */
export function generateScriptEndsWithDoctor(script) {
  const commands = script.split('&&').map(command => command.trim())
  return /^(pnpm|npm|yarn)( run)? nestled-doctor\b/.test(commands.at(-1) ?? '')
}
