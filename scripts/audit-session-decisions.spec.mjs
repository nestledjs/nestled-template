import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  auditFiles,
  auditSource,
  DEFAULT_SCOPE,
  formatReport,
  sourceFiles,
} from './audit-session-decisions.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const rules = (text, fileName = 'apps/web/app/routes/page.tsx') =>
  auditSource(fileName, text).findings.map(({ line, rule }) => ({ line, rule }))

describe('audit-session-decisions', () => {
  describe('navigate-to-sign-out', () => {
    const cases = [
      ['redirect', "throw redirect('/login?return_url=/x')"],
      ['redirectDocument', "throw redirectDocument('/force-logout')"],
      ['navigate', "navigate('/logout')"],
      ['a template target', 'navigate(`/login?return_url=${path}`)'],
      ['a concatenated target', "throw redirect('/login?return_url=' + path)"],
      ['location.href', "window.location.href = '/logout'"],
      ['location.assign', "globalThis.location.assign('/force-logout?return_url=/x')"],
      ['location.replace', "location.replace('/login')"],
    ]
    for (const [label, line] of cases) {
      it(`flags ${label}`, () => {
        assert.deepEqual(rules(`export function f() {\n  ${line}\n}`), [
          { line: 2, rule: 'navigate-to-sign-out' },
        ])
      })
    }

    it('flags <Navigate to="/login">', () => {
      const text = 'export function F() {\n  return <Navigate to="/login" replace />\n}'
      assert.deepEqual(rules(text), [{ line: 2, rule: 'navigate-to-sign-out' }])
    })

    it('ignores other targets and String#replace', () => {
      const text = [
        'export function f(path: string) {',
        "  navigate('/members/dashboard')",
        "  throw redirect('/loginx')",
        "  return path.replace('/login', '')",
        '}',
      ].join('\n')
      assert.deepEqual(rules(text), [])
    })
  })

  describe('auth-condition', () => {
    const cases = [
      ['status === 401', 'if (response.status === 401) return'],
      ['statusCode !== 401', 'if (error.statusCode !== 401) return'],
      ['401 == status', 'if (401 == status) return'],
      ["code === 'UNAUTHENTICATED'", "if (error.extensions.code === 'UNAUTHENTICATED') return"],
      [
        "classifyApiFailure(...) === 'unauthenticated'",
        "if (classifyApiFailure(error) === 'unauthenticated') return",
      ],
    ]
    for (const [label, line] of cases) {
      it(`flags ${label}`, () => {
        assert.deepEqual(rules(`export function f() {\n  ${line}\n}`), [
          { line: 2, rule: 'auth-condition' },
        ])
      })
    }

    it('ignores other statuses and codes, and message text', () => {
      const text = [
        'export function f() {',
        '  if (response.status === 403) return',
        "  if (error.extensions.code === 'FORBIDDEN') return",
        "  if (error.message === 'Unauthorized') return",
        '}',
      ].join('\n')
      assert.deepEqual(rules(text), [])
    })
  })

  describe('throw-401', () => {
    for (const line of [
      'throw data({ code: "X" }, { status: 401 })',
      'return Response.json({}, { status: 401 })',
      'return new Response(null, { status: 401 })',
    ]) {
      it(`flags ${line}`, () => {
        assert.deepEqual(rules(`export function f() {\n  ${line}\n}`), [
          { line: 2, rule: 'throw-401' },
        ])
      })
    }

    it('ignores other statuses', () => {
      assert.deepEqual(rules('export function f() {\n  throw data({}, { status: 503 })\n}'), [])
    })
  })

  describe('session-cookie-read', () => {
    it('flags getCookie(headers, getSessionCookieName())', () => {
      const text =
        'export function f(request: Request) {\n  return getCookie(request.headers, getSessionCookieName())\n}'
      assert.deepEqual(rules(text), [{ line: 2, rule: 'session-cookie-read' }])
    })

    const candidates =
      "export function f(request: Request) {\n  return cookieCandidates(request.headers.get('cookie'), getSessionCookieName())\n}"

    it('flags cookieCandidates(header, getSessionCookieName())', () => {
      const { findings } = auditSource('apps/web/app/routes/example.tsx', candidates)
      assert.deepEqual(
        findings.map(({ line, rule }) => ({ line, rule })),
        [{ line: 2, rule: 'session-cookie-read' }],
      )
      assert.match(findings[0].message, /forwardedSessionCookie\(request\)/)
      assert.match(findings[0].message, /sessionToken\(request\)/)
    })

    it('lets the server-side Apollo client read the candidates it forwards', () => {
      const { findings } = auditSource('libs/shared/apollo/src/lib/apollo.ts', candidates)
      assert.deepEqual(findings, [])
    })

    it('ignores any other cookie', () => {
      const text =
        "export function f(request: Request) {\n  return getCookie(request.headers, 'theme')\n}"
      assert.deepEqual(rules(text), [])
    })
  })

  describe('empty-organizations', () => {
    it('flags a catch that answers [] for a failed organizations read', () => {
      const text = [
        'export async function loader() {',
        '  try {',
        '    return (await client.query({ query: MyOrganizations })).data.myOrganizations',
        '  } catch {',
        '    return []',
        '  }',
        '}',
      ].join('\n')
      assert.deepEqual(rules(text), [{ line: 4, rule: 'empty-organizations' }])
    })

    it('ignores a catch that answers [] for anything else', () => {
      const text = [
        'export async function loader() {',
        '  try {',
        '    return (await client.query({ query: Posts })).data.posts',
        '  } catch {',
        '    return []',
        '  }',
        '}',
      ].join('\n')
      assert.deepEqual(rules(text), [])
    })
  })

  describe('the allow comment', () => {
    it('allows a site with a reason on the line above, and reports it', () => {
      const text = [
        'export function f() {',
        '  // nestled-session-allow: the user pressed Sign in',
        "  navigate('/login')",
        '}',
      ].join('\n')
      const { findings, allowed } = auditSource('apps/web/app/routes/page.tsx', text)
      assert.deepEqual(findings, [])
      assert.deepEqual(
        allowed.map(({ line, rule, reason }) => ({ line, rule, reason })),
        [{ line: 3, rule: 'navigate-to-sign-out', reason: 'the user pressed Sign in' }],
      )
    })

    it('allows a site with a reason on its own line', () => {
      const text =
        "export function f() {\n  navigate('/login') // nestled-session-allow: sign-in link\n}"
      assert.equal(auditSource('page.tsx', text).findings.length, 0)
    })

    it('needs a reason: a bare marker allows nothing', () => {
      const text = "export function f() {\n  // nestled-session-allow:\n  navigate('/login')\n}"
      assert.equal(auditSource('page.tsx', text).findings.length, 1)
    })

    it('reaches only the next line', () => {
      const text = [
        'export function f() {',
        '  // nestled-session-allow: the user pressed Sign in',
        '  const unrelated = 1',
        "  navigate('/login')",
        '}',
      ].join('\n')
      assert.equal(auditSource('page.tsx', text).findings.length, 1)
    })
  })

  describe('scope', () => {
    it('exempts the session module, the sign-out routes and specs', () => {
      const files = sourceFiles(root, DEFAULT_SCOPE)
      assert.ok(files.length > 0)
      for (const file of files) {
        assert.doesNotMatch(file, /^apps\/web\/app\/session\//)
        assert.doesNotMatch(file, /^libs\/shared\/apollo\/src\/lib\/session\//)
        assert.doesNotMatch(file, /routes\/(force-logout|logout)\.tsx$/)
        assert.doesNotMatch(file, /\.(spec|test|stories)\.[jt]sx?$/)
      }
      assert.ok(files.includes('apps/web/app/root.tsx'))
    })

    // No count: how many sites a project allows is its own, and the report lists each one.
    it('passes on this workspace: nothing found, and a reason for every allowed site', () => {
      const result = auditFiles(root)
      assert.deepEqual(result.findings, [], formatReport(result))
      assert.deepEqual(
        result.allowed.filter(({ reason }) => !reason?.trim()),
        [],
        formatReport(result),
      )
    })
  })
})
