// Gives every Nx project with a tsconfig.json one `typecheck` target that checks all of the
// project's configs — app or lib, spec, storybook — through scripts/typecheck-project.mjs.
//
// The Vite and React Router plugins infer `typecheck` as `tsc --noEmit -p tsconfig.lib.json`, which
// never checks a spec, and projects without those plugins (every libs/api library) got no
// typecheck at all. This plugin is listed last in nx.json so its target replaces the inferred one.
// A target written in a project's project.json still wins, for projects that need extra dependsOn
// or an explicit config list.

const { existsSync } = require('node:fs')
const { dirname, join } = require('node:path')

const runner = 'scripts/typecheck-project.mjs'

function typecheckTarget(projectRoot) {
  return {
    executor: 'nx:run-commands',
    cache: true,
    // Generated sources a project compiles against (the Prisma client) must exist first.
    dependsOn: ['generate', '^generate'],
    options: { command: `node ${runner} ${projectRoot}`, cwd: '' },
    inputs: [
      'default',
      '^production',
      '{workspaceRoot}/tsconfig.base.json',
      `{workspaceRoot}/${runner}`,
      { externalDependencies: ['typescript'] },
    ],
    outputs: [],
  }
}

exports.createNodesV2 = [
  '**/project.json',
  async (projectFiles, _options, context) =>
    projectFiles
      .map(projectFile => dirname(projectFile))
      .filter(projectRoot => projectRoot !== '.')
      .filter(projectRoot => existsSync(join(context.workspaceRoot, projectRoot, 'tsconfig.json')))
      .map(projectRoot => [
        join(projectRoot, 'project.json'),
        { projects: { [projectRoot]: { targets: { typecheck: typecheckTarget(projectRoot) } } } },
      ]),
]
