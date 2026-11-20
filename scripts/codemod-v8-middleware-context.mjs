#!/usr/bin/env node
// Moves a web app onto React Router's `future.v8_middleware`, where loaders and actions get a
// `RouterContextProvider` (read with `context.get(someContext)`) instead of a plain load-context
// object. The session middleware (apps/web/app/session/) needs it.
//
//   node scripts/codemod-v8-middleware-context.mjs [--dry-run] [--json] [--app apps/web]
//
// What it changes, idempotently (a second run changes nothing):
//   - react-router.config.ts: adds `future: { v8_middleware: true }` (or the flag to an existing
//     `future`).
//   - server.js (any file under the app with `getLoadContext`): an empty load context becomes
//     `new RouterContextProvider()`, imported from 'react-router'.
//   - app/entry.server.tsx: a load-context parameter typed `AppLoadContext` becomes
//     `RouterContextProvider`.
//   - an `AppLoadContext` augmentation (`declare module 'react-router' { interface AppLoadContext
//     ... }`) in a file of its own is deleted, and dropped from the app's tsconfig includes, when
//     nothing reads its keys.
//   - specs: a loader or action called with `context: {}` gets `context: new RouterContextProvider()`.
//
// What it reports and leaves to you (exit code 1 while any remain):
//   - a `getLoadContext` that returns keys. server.js cannot share a context object with the app
//     build, so each key moves into a middleware that sets a `createContext()` of its own.
//   - a loader or action reading `context.<key>` (or destructuring it): read it with
//     `context.get(<key>Context)` from that middleware.
//   - an `AppLoadContext` augmentation still read somewhere.
//
// It only uses the TypeScript compiler API the workspace already has; no new dependency.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const SKIPPED_FOLDERS = new Set([
  'node_modules',
  'build',
  'dist',
  'coverage',
  '.react-router',
  '.nx',
  'generated',
])
const SOURCE_FILE = /\.[cm]?[jt]sx?$/
const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/

function parse(fileName, text) {
  const kind = /x$/.test(fileName)
    ? ts.ScriptKind.TSX
    : /\.[cm]?js$/.test(fileName)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
}

/** Applies non-overlapping [start, end, replacement] edits to `text`. */
function applyEdits(text, edits) {
  let result = text
  for (const [start, end, replacement] of [...edits].sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) + replacement + result.slice(end)
  }
  return result
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

function walkFiles(folder, files = []) {
  if (!existsSync(folder)) return files
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) walkFiles(join(folder, entry.name), files)
    } else if (SOURCE_FILE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(join(folder, entry.name))
    }
  }
  return files
}

/**
 * An edit adding `name` to the file's `import { ... } from 'react-router'` (a value import), or a
 * new import line, unless it is already imported. Returns null when nothing is needed.
 */
function importEdit(source, name) {
  let typeOnlyClause = null
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react-router'
    ) {
      continue
    }
    const clause = statement.importClause
    const bindings = clause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    const existing = bindings.elements.find(element => element.name.text === name)
    if (existing && !existing.isTypeOnly && !clause.isTypeOnly) return null
    if (clause.isTypeOnly) {
      typeOnlyClause ??= bindings
      continue
    }
    if (existing) {
      // `type X` inside a value import: drop the `type` keyword.
      return [existing.getStart(source), existing.getEnd(), name]
    }
    const last = bindings.elements.at(-1)
    return last ? [last.getEnd(), last.getEnd(), `, ${name}`] : null
  }
  void typeOnlyClause
  const imports = source.statements.filter(ts.isImportDeclaration)
  const at = imports.length > 0 ? imports.at(-1).getEnd() : 0
  const line = `import { ${name} } from 'react-router'`
  return at === 0 ? [0, 0, `${line}\n`] : [at, at, `\n${line}`]
}

function propertyNamed(object, name) {
  return object.properties.find(
    property =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      property.name.getText() === name,
  )
}

// --- react-router.config ---------------------------------------------------------------------

function configObject(source) {
  for (const statement of source.statements) {
    if (!ts.isExportAssignment(statement)) continue
    let expression = statement.expression
    while (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression)) {
      expression = expression.expression
    }
    if (ts.isObjectLiteralExpression(expression)) return expression
    if (ts.isIdentifier(expression)) {
      for (const other of source.statements) {
        if (!ts.isVariableStatement(other)) continue
        for (const declaration of other.declarationList.declarations) {
          let initializer = declaration.initializer
          while (
            initializer &&
            (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer))
          ) {
            initializer = initializer.expression
          }
          if (
            declaration.name.getText() === expression.text &&
            initializer &&
            ts.isObjectLiteralExpression(initializer)
          ) {
            return initializer
          }
        }
      }
    }
  }
  return null
}

export function transformConfig(fileName, text) {
  const source = parse(fileName, text)
  const object = configObject(source)
  if (!object) {
    return {
      text,
      changes: [],
      todos: [{ file: fileName, line: 1, todo: 'add `future: { v8_middleware: true }` by hand' }],
    }
  }
  const future = propertyNamed(object, 'future')
  if (
    future &&
    ts.isPropertyAssignment(future) &&
    ts.isObjectLiteralExpression(future.initializer)
  ) {
    const flag = propertyNamed(future.initializer, 'v8_middleware')
    if (flag && ts.isPropertyAssignment(flag)) {
      if (flag.initializer.kind === ts.SyntaxKind.TrueKeyword)
        return { text, changes: [], todos: [] }
      return {
        text: applyEdits(text, [
          [flag.initializer.getStart(source), flag.initializer.getEnd(), 'true'],
        ]),
        changes: [{ file: fileName, change: 'set future.v8_middleware to true' }],
        todos: [],
      }
    }
    const inner = future.initializer
    const edit =
      inner.properties.length === 0
        ? [inner.getStart(source), inner.getEnd(), '{ v8_middleware: true }']
        : [
            inner.properties.at(-1).getEnd(),
            inner.properties.at(-1).getEnd(),
            ', v8_middleware: true',
          ]
    return {
      text: applyEdits(text, [edit]),
      changes: [{ file: fileName, change: 'added v8_middleware to future' }],
      todos: [],
    }
  }
  if (future) {
    return {
      text,
      changes: [],
      todos: [
        {
          file: fileName,
          line: lineOf(source, future),
          todo: 'add v8_middleware: true to `future` by hand',
        },
      ],
    }
  }
  const indent =
    /\n([ \t]*)\S[^\n]*$/.exec(
      text.slice(0, object.properties.at(-1)?.getStart(source) ?? 0),
    )?.[1] ?? '  '
  const flag =
    `${indent}// Route middleware, and a RouterContextProvider as every loader's \`context\`\n` +
    `${indent}// (the session middleware in app/session/ needs it).\n` +
    `${indent}future: { v8_middleware: true },`
  const last = object.properties.at(-1)
  let edit
  if (!last) {
    edit = [object.getStart(source), object.getEnd(), `{\n${flag}\n}`]
  } else {
    const after = text.slice(last.getEnd())
    const comma = after.trimStart().startsWith(',') ? after.indexOf(',') + 1 : 0
    const at = last.getEnd() + comma
    edit = [at, at, `${comma ? '' : ','}\n${flag}`]
  }
  return {
    text: applyEdits(text, [edit]),
    changes: [{ file: fileName, change: 'added future: { v8_middleware: true }' }],
    todos: [],
  }
}

// --- getLoadContext ------------------------------------------------------------------------------

function returnedObject(fn) {
  if (!fn.body) return null
  if (ts.isObjectLiteralExpression(fn.body)) return fn.body
  if (ts.isParenthesizedExpression(fn.body) && ts.isObjectLiteralExpression(fn.body.expression)) {
    return fn.body.expression
  }
  if (!ts.isBlock(fn.body)) return null
  const returns = fn.body.statements.filter(ts.isReturnStatement)
  if (returns.length !== 1 || fn.body.statements.length !== 1) return null
  const expression = returns[0].expression
  return expression && ts.isObjectLiteralExpression(expression) ? expression : null
}

function loadContextFunction(node) {
  if (
    (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
    node.name.getText() === 'getLoadContext'
  ) {
    if (ts.isMethodDeclaration(node)) return node
    const value = node.initializer
    return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value : null
  }
  if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'getLoadContext') return null
  return null
}

export function transformLoadContext(fileName, text) {
  if (!text.includes('getLoadContext')) return { text, changes: [], todos: [] }
  const source = parse(fileName, text)
  const edits = []
  const changes = []
  const todos = []
  let needsImport = false
  const visit = node => {
    const fn = loadContextFunction(node)
    if (fn) {
      const object = returnedObject(fn)
      if (!object) {
        if (!/new\s+RouterContextProvider\s*\(/.test(fn.getText(source))) {
          todos.push({
            file: fileName,
            line: lineOf(source, node),
            todo: 'getLoadContext must return a RouterContextProvider under v8_middleware; rewrite it by hand',
          })
        }
        return
      }
      if (object.properties.length > 0) {
        const keys = object.properties.map(property => property.name?.getText(source) ?? '?')
        todos.push({
          file: fileName,
          line: lineOf(source, node),
          todo: `getLoadContext returns keys (${keys.join(', ')}). server.js cannot share a context with the app build: set each in a middleware with its own createContext(), then return new RouterContextProvider() here`,
        })
        return
      }
      const replacement = 'new RouterContextProvider()'
      if (ts.isBlock(fn.body)) edits.push([object.getStart(source), object.getEnd(), replacement])
      else edits.push([fn.body.getStart(source), fn.body.getEnd(), replacement])
      needsImport = true
      changes.push({ file: fileName, change: 'getLoadContext returns new RouterContextProvider()' })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (needsImport) {
    const edit = importEdit(source, 'RouterContextProvider')
    if (edit) edits.push(edit)
  }
  return { text: edits.length ? applyEdits(text, edits) : text, changes, todos }
}

// --- entry.server ------------------------------------------------------------------------------

export function transformEntryServer(fileName, text) {
  if (!text.includes('AppLoadContext')) return { text, changes: [], todos: [] }
  const source = parse(fileName, text)
  const edits = []
  let replaced = false
  let otherUse = false
  const visit = node => {
    if (ts.isTypeReferenceNode(node) && node.typeName.getText(source) === 'AppLoadContext') {
      if (ts.isParameter(node.parent)) {
        edits.push([node.getStart(source), node.getEnd(), 'RouterContextProvider'])
        replaced = true
        return
      }
      otherUse = true
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!replaced) return { text, changes: [], todos: [] }
  // Drop the AppLoadContext import specifier when it is no longer used.
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'react-router')
      continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings) || otherUse) continue
    const element = bindings.elements.find(item => item.name.text === 'AppLoadContext')
    if (!element) continue
    const index = bindings.elements.indexOf(element)
    if (bindings.elements.length === 1) {
      edits.push([statement.getFullStart(), statement.getEnd(), ''])
    } else {
      const start = index === 0 ? element.getStart(source) : bindings.elements[index - 1].getEnd()
      const end = index === 0 ? bindings.elements[1].getStart(source) : element.getEnd()
      edits.push([start, end, ''])
    }
  }
  let next = applyEdits(text, edits)
  const edit = importEdit(parse(fileName, next), 'RouterContextProvider')
  if (edit) next = applyEdits(next, [edit])
  return {
    text: next,
    changes: [{ file: fileName, change: 'load-context parameter typed RouterContextProvider' }],
    todos: [],
  }
}

// --- context reads in loaders and actions -------------------------------------------------------

const ROUTE_EXPORTS = new Set(['loader', 'action', 'clientLoader', 'clientAction'])
const CONTEXT_METHODS = new Set(['get', 'set'])

function routeFunctions(source) {
  const functions = []
  for (const statement of source.statements) {
    const exported = statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) continue
    if (ts.isFunctionDeclaration(statement) && ROUTE_EXPORTS.has(statement.name?.text)) {
      functions.push(statement)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ROUTE_EXPORTS.has(declaration.name.getText(source)) && declaration.initializer) {
          functions.push(declaration.initializer)
        }
      }
    }
  }
  return functions
}

/** `context.foo` / `{ context: { foo } }` reads in exported loaders and actions. */
export function findContextReads(fileName, text) {
  if (!text.includes('context')) return []
  const source = parse(fileName, text)
  const todos = []
  for (const fn of routeFunctions(source)) {
    const visit = node => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'context' &&
        !CONTEXT_METHODS.has(node.name.text)
      ) {
        todos.push({
          file: fileName,
          line: lineOf(source, node),
          todo: `reads context.${node.name.text}: set it in a middleware with createContext(), read it with context.get(${node.name.text}Context)`,
        })
      }
      if (
        ts.isBindingElement(node) &&
        (node.propertyName ?? node.name).getText(source) === 'context' &&
        ts.isObjectBindingPattern(node.name)
      ) {
        for (const element of node.name.elements) {
          todos.push({
            file: fileName,
            line: lineOf(source, element),
            todo: `destructures context.${(element.propertyName ?? element.name).getText(source)}: read it with context.get(...) from a middleware's createContext()`,
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(fn)
  }
  return todos
}

// --- AppLoadContext augmentation -----------------------------------------------------------------

/** The keys a file's AppLoadContext augmentation declares, or null if it has none. */
export function augmentationKeys(fileName, text) {
  if (!text.includes('AppLoadContext')) return null
  const source = parse(fileName, text)
  let keys = null
  const visit = node => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'AppLoadContext') {
      keys = node.members.map(member => member.name?.getText(source)).filter(Boolean)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return keys
}

/** True when the file holds nothing but the augmentation (and a bare `import 'react-router'`). */
function isAugmentationOnly(fileName, text) {
  const source = parse(fileName, text)
  return source.statements.every(
    statement =>
      (ts.isImportDeclaration(statement) && !statement.importClause) ||
      (ts.isModuleDeclaration(statement) &&
        statement.name.getText(source).replace(/['"]/g, '') === 'react-router' &&
        statement.body &&
        ts.isModuleBlock(statement.body) &&
        statement.body.statements.every(
          inner => ts.isInterfaceDeclaration(inner) && inner.name.text === 'AppLoadContext',
        )),
  )
}

export function transformSpecContext(fileName, text) {
  if (!/context:\s*\{\s*\}/.test(text)) return { text, changes: [], todos: [] }
  const source = parse(fileName, text)
  const edits = []
  const visit = node => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'context' &&
      ts.isObjectLiteralExpression(node.initializer) &&
      node.initializer.properties.length === 0
    ) {
      edits.push([
        node.initializer.getStart(source),
        node.initializer.getEnd(),
        'new RouterContextProvider()',
      ])
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (edits.length === 0) return { text, changes: [], todos: [] }
  const importChange = importEdit(source, 'RouterContextProvider')
  if (importChange) edits.push(importChange)
  return {
    text: applyEdits(text, edits),
    changes: [
      {
        file: fileName,
        change: `${edits.length - (importChange ? 1 : 0)} × context: {} → new RouterContextProvider()`,
      },
    ],
    todos: [],
  }
}

// --- the run -------------------------------------------------------------------------------------

function removeFromTsconfigs(appDir, relativeFile, write) {
  const changes = []
  for (const name of readdirSync(appDir)) {
    if (!/^tsconfig.*\.json$/.test(name)) continue
    const path = join(appDir, name)
    const text = readFileSync(path, 'utf8')
    const pattern = new RegExp(
      `\\s*"${relativeFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",?`,
      'g',
    )
    if (!pattern.test(text)) continue
    const next = text.replace(pattern, '').replace(/,(\s*\])/g, '$1')
    if (write) writeFileSync(path, next)
    changes.push({ file: path, change: `dropped ${relativeFile} from include` })
  }
  return changes
}

export function run({ root = workspaceRoot, app = 'apps/web', write = true } = {}) {
  const appDir = join(root, app)
  const rel = path => relative(root, path)
  const changes = []
  const todos = []
  const save = (path, before, result) => {
    changes.push(...result.changes.map(change => ({ ...change, file: rel(path) })))
    todos.push(...result.todos.map(todo => ({ ...todo, file: rel(path) })))
    if (write && result.text !== before) writeFileSync(path, result.text)
  }

  for (const name of [
    'react-router.config.ts',
    'react-router.config.js',
    'react-router.config.mjs',
  ]) {
    const path = join(appDir, name)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    save(path, text, transformConfig(path, text))
  }

  const files = [
    ...walkFiles(appDir).filter(
      path =>
        !path.includes(`${join(appDir, 'app')}/`) && !path.includes(`${join(appDir, 'tests')}/`),
    ),
  ].filter(path => !SPEC_FILE.test(path))
  for (const path of files) {
    const text = readFileSync(path, 'utf8')
    save(path, text, transformLoadContext(path, text))
  }

  for (const name of ['entry.server.tsx', 'entry.server.ts', 'entry.server.jsx']) {
    const path = join(appDir, 'app', name)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    save(path, text, transformEntryServer(path, text))
  }

  const appFiles = walkFiles(join(appDir, 'app')).filter(path => !SPEC_FILE.test(path))
  const reads = []
  for (const path of appFiles) {
    reads.push(
      ...findContextReads(path, readFileSync(path, 'utf8')).map(todo => ({
        ...todo,
        file: rel(path),
      })),
    )
  }
  todos.push(...reads)

  // AppLoadContext augmentations: .d.ts files anywhere under the app.
  const declarationFiles = []
  const findDeclarations = folder => {
    if (!existsSync(folder)) return
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_FOLDERS.has(entry.name)) findDeclarations(join(folder, entry.name))
      } else if (entry.name.endsWith('.d.ts')) {
        declarationFiles.push(join(folder, entry.name))
      }
    }
  }
  findDeclarations(appDir)
  for (const path of declarationFiles) {
    const text = readFileSync(path, 'utf8')
    const keys = augmentationKeys(path, text)
    if (keys === null) continue
    const stillRead = reads.some(read => keys.some(key => read.todo.includes(`context.${key}`)))
    if (!stillRead && isAugmentationOnly(path, text)) {
      if (write) rmSync(path)
      changes.push({ file: rel(path), change: 'deleted the unused AppLoadContext augmentation' })
      changes.push(
        ...removeFromTsconfigs(appDir, relative(appDir, path), write).map(change => ({
          ...change,
          file: rel(change.file),
        })),
      )
    } else {
      todos.push({
        file: rel(path),
        line: 1,
        todo: `AppLoadContext (${keys.join(', ')}) has no meaning under v8_middleware: move each key into a createContext() and delete the augmentation`,
      })
    }
  }

  const specFiles = walkFiles(appDir).filter(path => SPEC_FILE.test(path))
  for (const path of specFiles) {
    const text = readFileSync(path, 'utf8')
    save(path, text, transformSpecContext(path, text))
  }

  return { changes, todos }
}

export function formatReport({ changes, todos }, { write }) {
  const lines = []
  lines.push(
    changes.length === 0
      ? 'Nothing to change: already on v8_middleware contexts.'
      : `${write ? 'Changed' : 'Would change'} ${changes.length}:`,
  )
  for (const change of changes) lines.push(`  ${change.file}  ${change.change}`)
  if (todos.length > 0) {
    lines.push(`${todos.length} left to do by hand:`)
    for (const todo of todos) lines.push(`  ${todo.file}:${todo.line}  ${todo.todo}`)
  }
  return `${lines.join('\n')}\n`
}

export function main(argv, root = workspaceRoot) {
  const write = !argv.includes('--dry-run')
  const appIndex = argv.indexOf('--app')
  const app = appIndex === -1 ? 'apps/web' : argv[appIndex + 1]
  const result = run({ root, app, write })
  process.stdout.write(
    argv.includes('--json')
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatReport(result, { write }),
  )
  return result.todos.length > 0 ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
