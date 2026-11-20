// Lists the mutation call sites that read a refusal from the mutation's result (`result.error`,
// `result.errors`, `const { error } = await mutate(...)`) while setting no `errorPolicy` of their
// own.
//
// Under the web client's mutation default, `errorPolicy: 'none'` (libs/shared/apollo makeClient), a
// refused mutation rejects: the promise never resolves with an `error`, so such a read never sees
// the refusal. Where the call sits in a `try` with a `catch` (or has a `.catch`), the catch sees
// it and the read is only dead code. Where it does not, the refusal is an unhandled rejection: no
// message, and whatever the error branch did (stay on the form, show the API message) never runs.
// Those are the sites to fix: move the handling into a catch.
//
//   node scripts/audit-mutation-error-reads.mjs [dir...]          list the sites (default: apps libs)
//   node scripts/audit-mutation-error-reads.mjs --json [dir...]   the same, as JSON
//
// It exits 1 when a site reads the result with nothing to catch the rejection, 0 otherwise.
//
// What counts as a mutation call site: `useMutation(document, options)`, a generated
// `useXxxMutation(options)` hook, and `client.mutate(options)` / `apollo.mutate(options)`. A site
// whose options are not an object literal (a variable, or an object that spreads another) may set
// `errorPolicy` where this cannot see; it is listed as "check by hand" and never fails the run.
// Reads are found within the function that calls the executor. A wrapper hook (a `run()` that
// awaits the executor and returns the result to its callers) is listed where it reads the result,
// not at each caller: audit the wrapper's callers for how they use what it returns.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const ERROR_FIELDS = new Set(['error', 'errors'])
// A helper handed the whole result is taken to read its error when its name says so.
const ERROR_HELPER = /error|fail|refus/i
const SKIPPED_FOLDERS = new Set([
  'node_modules',
  'generated',
  '__generated__',
  'dist',
  'build',
  'coverage',
  '.nx',
  '.react-router',
])
const SKIPPED_FILE = /\.(spec|test|stories)\.[cm]?tsx?$|\.d\.ts$/

/** `errorPolicy` in an options argument: 'set', 'unset', or 'unknown' (not a plain literal). */
function errorPolicyIn(options) {
  if (!options) return 'unset'
  if (!ts.isObjectLiteralExpression(options)) return 'unknown'
  let spread = false
  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property)) spread = true
    else if (property.name?.getText() === 'errorPolicy') return 'set'
  }
  return spread ? 'unknown' : 'unset'
}

function calleeName(call) {
  const callee = call.expression
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  return null
}

/** The mutation hook or direct `.mutate` call `call` is, with its options, or null. */
function mutationSite(call) {
  const name = calleeName(call)
  if (name === 'useMutation') return { kind: 'hook', options: call.arguments[1] }
  if (name && /^use[A-Z]\w*Mutation$/.test(name))
    return { kind: 'hook', options: call.arguments[0] }
  if (name === 'mutate' && ts.isPropertyAccessExpression(call.expression)) {
    return { kind: 'direct', options: call.arguments[0] }
  }
  return null
}

function enclosingFunction(node) {
  let current = node.parent
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current))
    current = current.parent
  return current
}

function isCatchCall(node, child) {
  return (
    ts.isPropertyAccessExpression(node) && node.expression === child && node.name.text === 'catch'
  )
}

/**
 * Whether a rejection of `node` reaches a catch within its function: a `.catch` on its chain, or a
 * `try` with a `catch` around it that it is awaited in. A promise only started in a `try` (not
 * awaited there) rejects after the `try` has finished, so that `catch` never sees it.
 */
function isCaught(node) {
  let awaited = false
  let child = node
  let current = node.parent
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current)) {
    if (isCatchCall(current, child)) return true
    if (ts.isAwaitExpression(current)) awaited = true
    if (ts.isTryStatement(current) && current.catchClause && current.tryBlock === child) {
      return awaited
    }
    child = current
    current = current.parent
  }
  return false
}

function bindsErrorField(pattern) {
  return (
    ts.isObjectBindingPattern(pattern) &&
    pattern.elements.some(element =>
      ERROR_FIELDS.has((element.propertyName ?? element.name).getText()),
    )
  )
}

/**
 * How `scope` reads a refusal off the variable `name`: `.error` / `.errors`, or by handing the whole
 * result to a helper named for errors (`mutationErrorMessage(result)`), which reads it there. Null
 * when it does not.
 */
function errorReadOf(scope, name) {
  let found = null
  const visit = node => {
    if (found) return
    if (
      ts.isPropertyAccessExpression(node) &&
      ERROR_FIELDS.has(node.name.text) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name
    ) {
      found = `reads ${name}.${node.name.text}`
      return
    }
    if (
      ts.isCallExpression(node) &&
      ERROR_HELPER.test(node.expression.getText()) &&
      node.arguments.some(argument => ts.isIdentifier(argument) && argument.text === name)
    ) {
      found = `passes ${name} to ${node.expression.getText()}()`
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

function unwrap(node) {
  let current = node
  while (current.parent && ts.isParenthesizedExpression(current.parent)) current = current.parent
  return current
}

/** A read off `result.<member>`: `.error` itself, or the result handed to a `.then` callback. */
function memberRead(member) {
  if (ERROR_FIELDS.has(member.name.text)) return `reads .${member.name.text}`
  if (member.name.text !== 'then') return null
  const callback = member.parent?.arguments?.[0]
  const param = callback && ts.isFunctionLike(callback) ? callback.parameters?.[0] : undefined
  if (!param) return null
  if (bindsErrorField(param.name)) return 'destructures error in .then'
  const read = ts.isIdentifier(param.name) && errorReadOf(callback, param.name.text)
  return read ? `${read} in .then` : null
}

function declarationRead(declaration) {
  if (bindsErrorField(declaration.name)) return 'destructures error'
  return ts.isIdentifier(declaration.name)
    ? errorReadOf(enclosingFunction(declaration), declaration.name.text)
    : null
}

/** How the result of the executor call `call` is read for a refusal, or null when it is not. */
function errorRead(call) {
  let result = unwrap(call)
  if (result.parent && ts.isAwaitExpression(result.parent)) result = unwrap(result.parent)
  const parent = result.parent
  if (!parent) return null
  if (ts.isPropertyAccessExpression(parent) && parent.expression === result) {
    return memberRead(parent)
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === result) {
    return declarationRead(parent)
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.right === result &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(parent.left)
  ) {
    return errorReadOf(enclosingFunction(parent), parent.left.text)
  }
  return null
}

/** The executor names a hook call is destructured into (`const [run] = useMutation(...)`). */
function executorName(hookCall) {
  const declaration = unwrap(hookCall).parent
  if (!declaration || !ts.isVariableDeclaration(declaration)) return null
  if (!ts.isArrayBindingPattern(declaration.name)) return null
  const first = declaration.name.elements[0]
  return first && ts.isBindingElement(first) && ts.isIdentifier(first.name) ? first.name.text : null
}

/** The functions declared in `source` by name (`function f() {}`, `const f = () => {}`). */
function functionsByName(source) {
  const functions = new Map()
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node)
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      functions.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return functions
}

/** The helper of this file `call` hands the executor `name` to, and the parameter it lands in. */
function helperTakingExecutor(call, name, functions) {
  const helper = functions.get(call.expression.text)
  const index = call.arguments.findIndex(
    argument => ts.isIdentifier(argument) && argument.text === name,
  )
  const param = helper && index >= 0 ? helper.parameters[index] : undefined
  return param && ts.isIdentifier(param.name) ? { helper, param: param.name.text } : null
}

/**
 * The calls of the executor `name` in `scope`, each with `via`: the helper calls it was reached
 * through. It follows the executor into a helper of the same file it is handed to
 * (`runUpdate(updateMutation, ...)`, called there as its parameter); a catch around that helper
 * call sees what the helper lets through.
 */
function callsTo(scope, name, functions, via = [], followed = new Set()) {
  const calls = []
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === name) calls.push({ call: node, via })
      const taken = helperTakingExecutor(node, name, functions)
      if (taken && !followed.has(taken.helper)) {
        followed.add(taken.helper)
        calls.push(...callsTo(taken.helper, taken.param, functions, [...via, node], followed))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return calls
}

/**
 * The errorPolicy that applies to one executor call: one passed to the executor itself
 * (`save({ errorPolicy })`) wins over the hook's.
 */
function effectivePolicy(hookPolicy, executorCall) {
  const own = errorPolicyIn(executorCall.arguments[0])
  return own === 'unset' ? hookPolicy : own
}

function verdictFor(policy, executorCall, via) {
  if (policy === 'unknown') return 'check-by-hand'
  return isCaught(executorCall) || via.some(isCaught) ? 'dead-read' : 'uncaught'
}

/** The findings in one source text. */
export function auditSource(fileName, text) {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
  const findings = []
  const functions = functionsByName(source)
  const line = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

  const report = (site, executorCall, policy, via = []) => {
    if (policy === 'set') return
    const read = errorRead(executorCall)
    if (!read) return
    findings.push({
      file: fileName,
      line: line(executorCall),
      siteLine: line(site),
      read,
      verdict: verdictFor(policy, executorCall, via),
    })
  }

  const auditHook = (hookCall, hookPolicy) => {
    const name = executorName(hookCall)
    const scope = name && enclosingFunction(hookCall)
    if (!scope) return
    for (const { call, via } of callsTo(scope, name, functions)) {
      report(hookCall, call, effectivePolicy(hookPolicy, call), via)
    }
  }

  const visit = node => {
    const site = ts.isCallExpression(node) ? mutationSite(node) : null
    if (site?.kind === 'direct') report(node, node, errorPolicyIn(site.options))
    else if (site) auditHook(node, errorPolicyIn(site.options))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}

function walk(folder, files) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) walk(path, files)
    } else if (/\.tsx?$/.test(entry.name) && !SKIPPED_FILE.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

/**
 * The TypeScript source files under `dirs` that can hold application mutation sites, relative to
 * `root` (build output, dependencies, generated code, specs and stories left out).
 */
export function sourceFiles(root, dirs) {
  return dirs
    .map(dir => join(root, dir))
    .filter(folder => existsSync(folder))
    .flatMap(folder => walk(folder, []))
    .map(path => relative(root, path).split(sep).join('/'))
    .sort((left, right) => left.localeCompare(right))
}

export function auditFiles(root, dirs) {
  return sourceFiles(root, dirs).flatMap(path =>
    auditSource(path, readFileSync(join(root, path), 'utf8')),
  )
}

const VERDICTS = {
  uncaught:
    'nothing catches the rejection: a refusal is lost (unhandled), and the error branch never runs. Move the handling into a catch.',
  'dead-read':
    'a catch sees the refusal; the result read is dead code. Optional: drop it, keep the catch.',
  'check-by-hand':
    'the options are not a plain object literal, so errorPolicy may be set elsewhere. Check it.',
}

export function formatFindings(findings) {
  if (findings.length === 0) return 'No mutation site reads a refusal from its result.\n'
  const lines = []
  for (const verdict of Object.keys(VERDICTS)) {
    const group = findings.filter(finding => finding.verdict === verdict)
    if (group.length === 0) continue
    lines.push(`${verdict} (${group.length}): ${VERDICTS[verdict]}`)
    for (const finding of group) {
      const site =
        finding.siteLine === finding.line ? '' : ` (mutation set up at line ${finding.siteLine})`
      lines.push(`  ${finding.file}:${finding.line}  ${finding.read}${site}`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

export function main(argv, root = workspaceRoot) {
  const json = argv.includes('--json')
  const dirs = argv.filter(arg => !arg.startsWith('--'))
  const findings = auditFiles(root, dirs.length > 0 ? dirs : ['apps', 'libs'])
  process.stdout.write(json ? `${JSON.stringify(findings, null, 2)}\n` : formatFindings(findings))
  return findings.some(finding => finding.verdict === 'uncaught') ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
