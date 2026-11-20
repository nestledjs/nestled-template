// Fails on any session decision made outside the session module.
//
// The web app judges a request's session once, in the root route's middleware
// (apps/web/app/session/session-middleware.server.ts, through `judgeSession` in
// libs/shared/apollo/src/lib/session). Everything else reads the verdict with `getSession(context)`
// or `requireUser(context)`. A sign-out decided anywhere else (a loader that redirects to /login on
// a 401, an error boundary that sends the browser to /force-logout, an error link that navigates
// to /logout) is how sessions used to end during API outages. This audit keeps that from coming
// back, whether a person or an AI agent writes the code.
//
//   node scripts/audit-session-decisions.mjs            audit the default scope, exit 1 on a finding
//   node scripts/audit-session-decisions.mjs --json     the same, as JSON
//   node scripts/audit-session-decisions.mjs dir...     audit other folders (same exemptions)
//
// It fails on, outside the exempt paths:
//   navigate-to-sign-out  redirect( / redirectDocument( / replace( / navigate( / <Navigate to> /
//                         location.href = / location.assign( / location.replace( whose target
//                         starts with /login, /logout or /force-logout
//   auth-condition        a condition on a 401 or on UNAUTHENTICATED: `status === 401`,
//                         `statusCode === 401`, `.code === 'UNAUTHENTICATED'`,
//                         `classifyApiFailure(...) === 'unauthenticated'`
//   throw-401             a 401 made by hand: `data(..., { status: 401 })`,
//                         `new Response(..., { status: 401 })`, `Response.json(..., { status: 401 })`
//   session-cookie-read   `getCookie(..., getSessionCookieName())`
//   empty-organizations   a `catch` that returns `[]` in a function that reads organizations
//                         (`myOrganizations` / `MyOrganizations...`): a failed read must never look
//                         like "no organizations"
//
// Escape hatch, for user-initiated navigations (a "Log in" button, the user's own sign-out, the end
// of a password reset) and for the classification primitives: `// nestled-session-allow: <reason>`
// on the line, or alone on the line just above it. The reason is required.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))

export const DEFAULT_SCOPE = ['apps/web/app', 'libs/web/src', 'libs/shared/apollo/src']

// The session module, and the two routes whose whole job is a sign-out.
export const EXEMPT = [
  /^apps\/web\/app\/session\//,
  /^libs\/shared\/apollo\/src\/lib\/session\//,
  /^apps\/web\/app\/routes\/force-logout\.tsx$/,
  /^apps\/web\/app\/routes\/logout\.tsx$/,
]

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
const SKIPPED_FILE = /\.(spec|test|stories)\.[cm]?[jt]sx?$|\.d\.ts$/
const SOURCE_FILE = /\.[cm]?[jt]sx?$/

const SIGN_OUT_TARGET = /^\/(login|logout|force-logout)(?=$|[/?#])/
const ALLOW = /\/\/\s*nestled-session-allow:\s*(\S.*)$/
const NAVIGATING_CALLS = new Set(['redirect', 'redirectDocument', 'replace', 'navigate'])

export const MESSAGES = {
  'navigate-to-sign-out':
    'navigates to a sign-out or sign-in page. Only the session middleware decides a session: read getSession(context), and let requireSession send the request on. A user-initiated navigation takes `// nestled-session-allow: <reason>`.',
  'auth-condition':
    'branches on a 401 / UNAUTHENTICATED. A 401 is not a verdict: let it reach the root ErrorBoundary (it revalidates and the middleware decides), or read getSession(context).',
  'throw-401':
    'makes a 401 by hand. Throw narrowApiError(error) for a refused call; only the session middleware turns a 401 into a sign-out.',
  'session-cookie-read':
    'reads the session cookie. Read getSession(context) instead (or forwardedSessionCookie(request) to pass it to the API).',
  'empty-organizations':
    'returns [] when reading organizations fails. A failed read must not look like "no organizations": let it throw (narrowApiError) so the outage screen or the error screen shows.',
}

/** The leading text of a string-ish target: a literal, or the head of a template / concatenation. */
function targetText(node) {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) return node.head.text
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return targetText(node.left)
  }
  if (ts.isParenthesizedExpression(node)) return targetText(node.expression)
  return null
}

function isSignOutTarget(node) {
  const text = targetText(node)
  return text !== null && SIGN_OUT_TARGET.test(text)
}

function calleeName(call) {
  const callee = call.expression
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  return null
}

function isLocationAccess(node) {
  // location, window.location, globalThis.location, globalThis.window.location, document.location
  if (ts.isIdentifier(node)) return node.text === 'location'
  return ts.isPropertyAccessExpression(node) && node.name.text === 'location'
}

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return node.argumentExpression.text
  }
  return null
}

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
])

function isAuthComparisonSide(side, other) {
  if (ts.isNumericLiteral(other) && other.text === '401') {
    const name = propertyName(side) ?? (ts.isIdentifier(side) ? side.text : null)
    return name !== null && /status(Code)?$/i.test(name)
  }
  if (ts.isStringLiteral(other) && other.text === 'UNAUTHENTICATED') {
    return propertyName(side) === 'code'
  }
  if (ts.isStringLiteral(other) && other.text === 'unauthenticated') {
    return ts.isCallExpression(side) && calleeName(side) === 'classifyApiFailure'
  }
  return false
}

function isAuthCondition(node) {
  if (!ts.isBinaryExpression(node) || !EQUALITY.has(node.operatorToken.kind)) return false
  return isAuthComparisonSide(node.left, node.right) || isAuthComparisonSide(node.right, node.left)
}

function has401Status(options) {
  return (
    !!options &&
    ts.isObjectLiteralExpression(options) &&
    options.properties.some(
      property =>
        ts.isPropertyAssignment(property) &&
        property.name.getText() === 'status' &&
        ts.isNumericLiteral(property.initializer) &&
        property.initializer.text === '401',
    )
  )
}

function isHand401(node) {
  if (ts.isCallExpression(node)) {
    const name = calleeName(node)
    const isResponseJson =
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'Response' &&
      name === 'json'
    return (name === 'data' || isResponseJson) && has401Status(node.arguments[1])
  }
  if (ts.isNewExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Response' &&
      has401Status(node.arguments?.[1])
    )
  }
  return false
}

function isSessionCookieRead(node) {
  if (!ts.isCallExpression(node) || calleeName(node) !== 'getCookie') return false
  const name = node.arguments[1]
  return !!name && ts.isCallExpression(name) && calleeName(name) === 'getSessionCookieName'
}

function isNavigation(node) {
  if (ts.isCallExpression(node)) {
    const name = calleeName(node)
    if (NAVIGATING_CALLS.has(name) && isSignOutTarget(node.arguments[0])) {
      // `replace` only as a router call or location.replace, never String#replace('/login', ...)
      if (name === 'replace' && ts.isPropertyAccessExpression(node.expression)) {
        return isLocationAccess(node.expression.expression)
      }
      return true
    }
    if (
      name === 'assign' &&
      ts.isPropertyAccessExpression(node.expression) &&
      isLocationAccess(node.expression.expression)
    ) {
      return isSignOutTarget(node.arguments[0])
    }
    return false
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    node.left.name.text === 'href' &&
    isLocationAccess(node.left.expression)
  ) {
    return isSignOutTarget(node.right)
  }
  if (
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    node.tagName.getText() === 'Navigate'
  ) {
    const to = node.attributes.properties.find(
      attribute => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'to',
    )
    const initializer = to?.initializer
    if (!initializer) return false
    if (ts.isStringLiteral(initializer)) return isSignOutTarget(initializer)
    return ts.isJsxExpression(initializer) && isSignOutTarget(initializer.expression)
  }
  return false
}

const ORGANIZATIONS_READ = /\b(myOrganizations|MyOrganizations\w*)\b/

function returnsEmptyArray(block) {
  let found = false
  const visit = node => {
    if (found || ts.isFunctionLike(node)) return
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isArrayLiteralExpression(node.expression) &&
      node.expression.elements.length === 0
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(block, visit)
  return found
}

function enclosingFunction(node) {
  let current = node.parent
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current))
    current = current.parent
  return current
}

function isEmptyOrganizationsCatch(node) {
  if (!ts.isCatchClause(node) || !returnsEmptyArray(node.block)) return false
  const scope = enclosingFunction(node)
  return !!scope && ORGANIZATIONS_READ.test(scope.getText())
}

function allowReason(lines, line) {
  const own = ALLOW.exec(lines[line - 1] ?? '')
  if (own) return own[1].trim()
  const previous = (lines[line - 2] ?? '').trim()
  const above = previous.startsWith('//') ? ALLOW.exec(previous) : null
  return above ? above[1].trim() : null
}

/** The findings and allowed sites in one file's text. */
export function auditSource(fileName, text) {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
  const lines = text.split('\n')
  const findings = []
  const allowed = []
  const seen = new Set()

  const report = (node, rule) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
    const key = `${line}:${rule}`
    if (seen.has(key)) return
    seen.add(key)
    const reason = allowReason(lines, line)
    if (reason) allowed.push({ file: fileName, line, rule, reason })
    else findings.push({ file: fileName, line, rule, message: MESSAGES[rule] })
  }

  const visit = node => {
    if (isNavigation(node)) report(node, 'navigate-to-sign-out')
    else if (isAuthCondition(node)) report(node, 'auth-condition')
    else if (isHand401(node)) report(node, 'throw-401')
    else if (isSessionCookieRead(node)) report(node, 'session-cookie-read')
    else if (isEmptyOrganizationsCatch(node)) report(node, 'empty-organizations')
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { findings, allowed }
}

function walk(folder, files) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) walk(path, files)
    } else if (SOURCE_FILE.test(entry.name) && !SKIPPED_FILE.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

/** The audited source files under `dirs`, relative to `root`, with the exempt paths left out. */
export function sourceFiles(root, dirs) {
  return dirs
    .map(dir => join(root, dir))
    .filter(folder => existsSync(folder))
    .flatMap(folder => walk(folder, []))
    .map(path => relative(root, path).split(sep).join('/'))
    .filter(path => !EXEMPT.some(pattern => pattern.test(path)))
    .sort((left, right) => left.localeCompare(right))
}

export function auditFiles(root, dirs = DEFAULT_SCOPE) {
  const findings = []
  const allowed = []
  for (const path of sourceFiles(root, dirs)) {
    const result = auditSource(path, readFileSync(join(root, path), 'utf8'))
    findings.push(...result.findings)
    allowed.push(...result.allowed)
  }
  return { findings, allowed }
}

export function formatReport({ findings, allowed }) {
  const lines = []
  if (findings.length === 0) {
    lines.push('No session decision outside the session module.')
  } else {
    lines.push(
      `${findings.length} session decision(s) outside apps/web/app/session/ (the session middleware decides; everything else reads getSession(context)):`,
    )
    for (const finding of findings) {
      lines.push(`  ${finding.file}:${finding.line}  [${finding.rule}] ${finding.message}`)
    }
  }
  lines.push(`${allowed.length} allowed by \`// nestled-session-allow\`:`)
  for (const site of allowed)
    lines.push(`  ${site.file}:${site.line}  [${site.rule}] ${site.reason}`)
  return `${lines.join('\n')}\n`
}

export function main(argv, root = workspaceRoot) {
  const json = argv.includes('--json')
  const dirs = argv.filter(arg => !arg.startsWith('--'))
  const result = auditFiles(root, dirs.length > 0 ? dirs : DEFAULT_SCOPE)
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : formatReport(result))
  return result.findings.length > 0 ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
