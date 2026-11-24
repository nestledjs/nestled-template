import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const ts = createRequire(import.meta.url)('typescript')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Every folder with Apollo client code. A clone that embeds no package of its own lacks some.
const CLIENT_FOLDERS = [
  'apps/web/app',
  'libs/web',
  'libs/web-ui',
  'libs/shared',
  'libs/access-control',
  'libs/data-browser',
  'libs/shared-components',
]
const SKIPPED_FOLDERS = new Set(['node_modules', 'build', 'dist', 'generated', '.react-router'])
const TESTS = /\.(spec|test|stories)\.tsx?$/

const OPERATIONS = new Set([
  'mutate',
  'preloadQuery',
  'query',
  'useBackgroundQuery',
  'useLazyQuery',
  'useLoadableQuery',
  'useMutation',
  'useQuery',
  'useSubscription',
  'useSuspenseQuery',
  'watchQuery',
])
// Given their variables when the function they return is called, so nothing at the call shows them.
const VARIABLES_LATER = new Set(['useLazyQuery', 'useLoadableQuery', 'useMutation'])

function* sourceFiles(folder) {
  if (!existsSync(folder)) return
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) yield* sourceFiles(path)
    } else if (/\.tsx?$/.test(entry.name) && !TESTS.test(entry.name)) {
      yield path
    }
  }
}

function calledName({ expression }) {
  if (ts.isIdentifier(expression)) return expression.text
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined
}

// Options spread in, or built elsewhere, may hold variables, so they count as if they did.
function mayPassVariables(argument, index) {
  if (!ts.isObjectLiteralExpression(argument)) return index > 0
  return argument.properties.some(
    property => ts.isSpreadAssignment(property) || property.name.getText() === 'variables',
  )
}

/**
 * The calls that give one type argument, the result's, while passing variables. TypeScript does not
 * infer the rest once one is given: the variables fall back to "any object", and a field the API
 * does not have is found by the user.
 */
function untypedOperations(fileName, text) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const found = []
  const visit = node => {
    if (ts.isCallExpression(node) && node.typeArguments?.length === 1) {
      const name = calledName(node)
      if (
        OPERATIONS.has(name) &&
        (VARIABLES_LATER.has(name) || node.arguments.some(mayPassVariables))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.expression.getEnd())
        found.push(`${fileName}:${line + 1} ${name}<${node.typeArguments[0].getText(source)}>`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('the types of Apollo operations', () => {
  it('come from the document, variables included', () => {
    const files = CLIENT_FOLDERS.flatMap(folder => [...sourceFiles(join(root, folder))])
    assert.ok(files.length > 50, `only ${files.length} files were read`)
    const found = files.flatMap(file =>
      untypedOperations(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')),
    )
    assert.deepEqual(
      found,
      [],
      'Drop the type argument, so the generated document types the result and the variables.',
    )
  })

  for (const [call, expected] of [
    ['preloadQuery<Q>(Doc, { variables: { a: 1 } })', 1],
    ['preloadQuery<Q>(Doc, { variables })', 1],
    ['useQuery<Q>(Doc, { ...options })', 1],
    ['useQuery<Q>(Doc, options)', 1],
    ['client.query<Q>({ query: Doc, variables: {} })', 1],
    ['useMutation<M>(Doc)', 1],
    ['useLazyQuery<Q>(Doc)', 1],
    ['useQuery<Q>(Doc)', 0],
    ["useQuery<Q>(Doc, { fetchPolicy: 'network-only' })", 0],
    ['useQuery(Doc, { variables: { a: 1 } })', 0],
    ['useMutation(Doc)', 0],
    ['useMutation<M, V>(Doc)', 0],
    ['useState<Q>(options)', 0],
  ]) {
    it(`${expected ? 'refuses' : 'allows'} ${call}`, () => {
      assert.equal(untypedOperations('example.tsx', call).length, expected)
    })
  }
})

describe('the declaration of react-router/route-module', () => {
  const declaration = join(root, 'apps/web/app/react-router-route-module.d.ts')
  const integration = join(root, 'node_modules/@apollo/client-integration-react-router')
  const MODULE = 'react-router/route-module'
  const OBSOLETE = `Delete apps/web/app/react-router-route-module.d.ts: an ambient module hides the real one.`

  const resolves = fromFile =>
    Boolean(
      ts.resolveModuleName(
        MODULE,
        fromFile,
        { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
        ts.sys,
      ).resolvedModule,
    )

  function parse(file) {
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  }

  it('is still needed: React Router does not export the path', () => {
    assert.equal(resolves(join(root, 'apps/web/app/root.tsx')), false, OBSOLETE)
  })

  it('notices a React Router that does', () => {
    const app = mkdtempSync(join(tmpdir(), 'route-module-'))
    try {
      const router = join(app, 'node_modules/react-router')
      mkdirSync(router, { recursive: true })
      writeFileSync(
        join(router, 'package.json'),
        JSON.stringify({
          name: 'react-router',
          exports: { '.': './index.d.ts', './route-module': { types: './route-module.d.ts' } },
        }),
      )
      writeFileSync(join(router, 'index.d.ts'), 'export {}\n')
      assert.equal(resolves(join(app, 'root.tsx')), false, 'the file is not there yet')
      writeFileSync(join(router, 'route-module.d.ts'), 'export type A = 1\n')
      assert.equal(resolves(join(app, 'root.tsx')), true)
    } finally {
      rmSync(app, { recursive: true, force: true })
    }
  })

  it('declares exactly what the Apollo integration imports from it', () => {
    const { types } = JSON.parse(readFileSync(join(integration, 'package.json'), 'utf8'))
    const imported = parse(join(integration, types ?? 'dist/index.d.ts'))
      .statements.filter(
        statement => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === MODULE,
      )
      .flatMap(statement => statement.importClause.namedBindings.elements)
      .map(element => (element.propertyName ?? element.name).text)
    assert.notDeepEqual(imported, [], OBSOLETE)

    const modules = parse(declaration).statements.filter(ts.isModuleDeclaration)
    assert.deepEqual(
      modules.map(module => module.name.text),
      [MODULE],
    )
    const declared = modules[0].body.statements.map(statement => statement.name.text)
    assert.deepEqual(declared.sort(), imported.sort())
  })

  it('is part of the web app’s program', () => {
    const config = join(root, 'apps/web/tsconfig.app.json')
    const { fileNames } = ts.parseJsonConfigFileContent(
      ts.readConfigFile(config, ts.sys.readFile).config,
      ts.sys,
      dirname(config),
    )
    const files = fileNames.map(file => relative(root, file).split(sep).join('/'))
    assert.ok(
      files.includes('apps/web/app/react-router-route-module.d.ts'),
      'apps/web/tsconfig.app.json must include app/**/*.ts',
    )
  })
})
